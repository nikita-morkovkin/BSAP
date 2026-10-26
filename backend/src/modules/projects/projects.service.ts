import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, promises as fs } from 'fs';
import { MasterProjectQueueService } from '../audio/master-project-queue.service';
import { PromptService } from '../llm/prompt.service';
import { ScriptGeneratorService } from '../llm/script-generator.service';
import { ScriptQueueService } from '../llm/script-queue.service';
import { outlineSchema, profileSchema } from '../state/schemas';
import { StateManagerService } from '../state/state-manager.service';
import type { Outline, Profile, State } from '../state/types';
import { TtsQueueService } from '../text/tts-queue.service';
import { ChapterAssemblyQueueService } from '../tts/chapter-assembly-queue.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { RegenerateChunkDto } from './dto/regenerate-chunk.dto';
import { ProjectDeletionService } from './project-deletion.service';
import type { ProjectSummary } from './types/project-summary.type';

@Injectable()
export class ProjectsService {
  private readonly architectModel: string;
  private readonly writerModel: string;

  constructor(
    private readonly stateManagerService: StateManagerService,
    private readonly promptService: PromptService,
    private readonly configService: ConfigService,
    private readonly scriptQueueService: ScriptQueueService,
    private readonly ttsQueueService: TtsQueueService,
    private readonly chapterAssemblyQueueService: ChapterAssemblyQueueService,
    private readonly masterProjectQueueService: MasterProjectQueueService,
    private readonly projectDeletionService: ProjectDeletionService,
    private readonly scriptGeneratorService: ScriptGeneratorService,
  ) {
    this.architectModel = this.configService.getOrThrow<string>(
      'DEFAULT_ARCHITECT_MODEL',
    );
    this.writerModel = this.configService.getOrThrow<string>(
      'DEFAULT_WRITER_MODEL',
    );
  }

  public async listProjects(): Promise<ProjectSummary[]> {
    const projects = await this.stateManagerService.listProjects();

    return projects.map(
      ({ projectId, topic, createdAt, updatedAt, status, error }) => ({
        projectId,
        topic,
        createdAt,
        updatedAt,
        status,
        ...(error ? { error } : {}),
      }),
    );
  }

  public async getDefaults(): Promise<Profile> {
    const [architectSystemPrompt, writerSystemPrompt] = await Promise.all([
      this.promptService.getDefaultSystemPrompt('architect'),
      this.promptService.getDefaultSystemPrompt('writer'),
    ]);

    return profileSchema.parse({
      architectModel: this.architectModel,
      writerModel: this.writerModel,
      architectReasoningEffort: 'high',
      writerReasoningEffort: 'none',
      temperature: 0.7,
      architectSystemPrompt,
      writerSystemPrompt,
      ttsVoice: 'bm_george',
      ttsSpeed: 0.85,
      masteringConfig: {},
    });
  }

  public async createProject(payload: CreateProjectDto): Promise<State> {
    const state = await this.stateManagerService.initProject(
      payload.topic,
      payload.profile,
    );

    await this.scriptQueueService.enqueueProject(state.projectId);

    return state;
  }

  public async deleteProject(projectId: string): Promise<void> {
    await this.getState(projectId);
    await this.projectDeletionService.deleteProject(projectId);
  }

  public async cancelOutline(projectId: string): Promise<State> {
    await this.getState(projectId);
    await this.scriptGeneratorService.cancelOutline(projectId);
    return this.getState(projectId);
  }

  public async getState(projectId: string): Promise<State> {
    try {
      return await this.stateManagerService.getState(projectId);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new NotFoundException('Project not found');
      }

      throw error;
    }
  }

  public async getProject(
    projectId: string,
  ): Promise<{ state: State; outline: Outline | null }> {
    const state = await this.getState(projectId);
    const path = this.stateManagerService.getArtifactPath(
      projectId,
      'outline.json',
    );
    let outline: Outline | null = null;

    try {
      const contents: unknown = JSON.parse(await fs.readFile(path, 'utf8'));

      outline = outlineSchema.parse(contents);
    } catch (error: unknown) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        !('code' in error && error.code === 'ENOENT')
      ) {
        throw error;
      }
    }

    return { state, outline };
  }

  public async resume(projectId: string): Promise<State> {
    const state = await this.getState(projectId);
    const chapters = Object.values(state.chapters);
    const pendingChapters =
      await this.stateManagerService.getPendingChapters(projectId);

    if (
      !state.outlineCompleted ||
      pendingChapters.length > 0 ||
      chapters.length === 0
    ) {
      if (state.status === 'CANCELLED') {
        await this.stateManagerService.updateState(projectId, (current) => {
          current.status = 'IDLE';
          delete current.error;
        });
      }
      await this.scriptQueueService.enqueueProject(projectId);

      return this.getState(projectId);
    }

    if (chapters.some((chapter) => chapter.chunks.length === 0)) {
      await this.scriptQueueService.enqueueNormalization(projectId);

      return this.getState(projectId);
    }

    let pendingAudio = false;

    for (const chapter of chapters) {
      const chunks = await this.stateManagerService.getPendingChunks(
        projectId,
        chapter.chapterNumber,
      );

      if (chunks.length > 0) {
        pendingAudio = true;

        for (const chunk of chunks) {
          await this.ttsQueueService.enqueueChunk({
            projectId,
            chapterNumber: chapter.chapterNumber,
            chunkId: chunk.id,
          });
        }
      } else if (
        chapter.ttsStatus !== 'COMPLETED' ||
        !existsSync(
          this.stateManagerService.getArtifactPath(
            projectId,
            chapter.audioFilePath,
          ),
        )
      ) {
        pendingAudio = true;

        await this.chapterAssemblyQueueService.enqueueChapter({
          projectId,
          chapterNumber: chapter.chapterNumber,
        });
      }
    }

    const outputs = ['wav', 'flac', 'timestamps', 'markers'] as const;
    const missingOutput = outputs.some((artifact) => {
      const path = state.outputFiles[artifact];

      return (
        !path ||
        !existsSync(this.stateManagerService.getArtifactPath(projectId, path))
      );
    });

    if (!pendingAudio && (state.status !== 'COMPLETED' || missingOutput)) {
      await this.masterProjectQueueService.enqueueProject(projectId);
    }

    return this.getState(projectId);
  }

  public async regenerateChunk(
    projectId: string,
    chapterNumber: number,
    chunkId: string,
    overrides: RegenerateChunkDto,
  ): Promise<State> {
    await this.getState(projectId);

    const state = await this.stateManagerService.updateState(
      projectId,
      (current) => {
        const chapter = current.chapters[String(chapterNumber)];
        const chunk = chapter?.chunks.find(
          (candidate) => candidate.id === chunkId,
        );

        if (!chunk) {
          throw new NotFoundException('Chunk not found');
        }

        if (
          !['COMPLETED', 'FAILED', 'IDLE'].includes(current.status) ||
          Object.values(current.chapters).some(
            (candidate) => candidate.ttsStatus !== 'COMPLETED',
          )
        ) {
          throw new ConflictException(
            'Finish or resume the pipeline before regenerating a chunk',
          );
        }

        Object.assign(chunk, overrides);

        chunk.status = 'PENDING';
        chunk.durationMs = 0;
        chapter.ttsStatus = 'PENDING';
        chapter.durationMs = 0;
        current.status = 'SYNTHESIZING_AUDIO';
        current.outputFiles = {};

        delete current.error;
      },
    );

    await this.ttsQueueService.enqueueChunk({
      projectId,
      chapterNumber,
      chunkId,
    });

    return state;
  }
}
