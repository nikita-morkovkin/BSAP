import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { existsSync, promises as fs } from 'fs';
import { writeArtifact } from '../../utils/write-artifact.util';
import { StateManagerService } from '../state/state-manager.service';
import { Outline } from '../state/types';
import { PolzaLlmService } from './polza-llm.service';
import { PromptService } from './prompt.service';
import { ScriptQueueService } from './script-queue.service';
import { parseOutline } from './utils/parse-outline.util';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import type { ScriptJob } from './types/script-job.type';

@Injectable()
export class ScriptGeneratorService {
  private readonly activeOutlines = new Map<string, AbortController>();

  constructor(
    private readonly stateManagerService: StateManagerService,
    private readonly polzaLlmService: PolzaLlmService,
    private readonly promptService: PromptService,
    private readonly scriptQueueService: ScriptQueueService,
    @InjectQueue(PIPELINE_JOBS.scriptQueue)
    private readonly scriptQueue: Queue<ScriptJob>,
  ) {}

  public async generateOutline(projectId: string): Promise<Outline> {
    const controller = new AbortController();
    this.activeOutlines.set(projectId, controller);

    try {
      const state = await this.stateManagerService.getState(projectId);
      const path = this.stateManagerService.getArtifactPath(
        projectId,
        'outline.json',
      );

      if (state.status === 'CANCELLED') {
        throw new Error('Outline generation was cancelled');
      }

      if (state.outlineCompleted && existsSync(path)) {
        return this.readOutline(projectId);
      }

      if (Object.keys(state.chapters).length > 0) {
        throw new Error(
          'Cannot replace a missing or incomplete outline with existing chapters',
        );
      }

      await this.stateManagerService.updateState(projectId, (current) => {
        if (current.status === 'CANCELLED' || controller.signal.aborted) {
          throw new Error('Outline generation was cancelled');
        }
        current.status = 'GENERATING_OUTLINE';
        delete current.error;
      });

      const system = await this.promptService.getSystemPrompt(
        'architect',
        state.profile.architectSystemPrompt,
      );
      const text = await this.polzaLlmService.generateText({
        model: state.profile.architectModel,
        system,
        prompt: `Design the documentary outline for this topic:\n${state.topic}`,
        reasoningEffort: state.profile.architectReasoningEffort,
        temperature: state.profile.temperature,
        abortSignal: controller.signal,
      });
      if (controller.signal.aborted) {
        throw new Error('Outline generation was cancelled');
      }
      const outline = parseOutline(text);

      await writeArtifact(path, `${JSON.stringify(outline, null, 2)}\n`);
      if (controller.signal.aborted) {
        throw new Error('Outline generation was cancelled');
      }
      await this.stateManagerService.updateState(projectId, (current) => {
        if (current.status === 'CANCELLED' || controller.signal.aborted) {
          throw new Error('Outline generation was cancelled');
        }
        current.outlineCompleted = true;
        current.status = 'GENERATING_SCRIPTS';
        delete current.error;

        for (const chapter of outline.chapters) {
          const prefix = `ch_${String(chapter.chapterNumber).padStart(2, '0')}`;

          current.chapters[String(chapter.chapterNumber)] = {
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            scriptStatus: 'PENDING',
            ttsStatus: 'PENDING',
            scriptFilePath: `chapters/${prefix}_raw.txt`,
            audioFilePath: `chapters/${prefix}_master.wav`,
            durationMs: 0,
            chunks: [],
          };
        }
      });

      return outline;
    } catch (error) {
      const current = await this.stateManagerService
        .getState(projectId)
        .catch(() => undefined);
      if (controller.signal.aborted || current?.status === 'CANCELLED') {
        throw new Error('Outline generation was cancelled');
      }
      await this.markFailed(projectId, error);

      throw error;
    } finally {
      if (this.activeOutlines.get(projectId) === controller) {
        this.activeOutlines.delete(projectId);
      }
    }
  }

  public async cancelOutline(projectId: string): Promise<void> {
    const job = await this.scriptQueue.getJob(`scripts-${projectId}`);
    await this.stateManagerService.updateState(projectId, (current) => {
      if (current.status !== 'GENERATING_OUTLINE' || current.outlineCompleted) {
        throw new ConflictException('Outline generation is no longer active');
      }
      current.status = 'CANCELLED';
      current.error = 'Outline generation cancelled by user';
    });

    this.activeOutlines.get(projectId)?.abort();
    if (job) {
      const jobState = await job.getState();
      if (jobState !== 'active') {
        try {
          await job.remove();
        } catch {
          // It may have become active after getState; its abort signal is handled above.
        }
      } else {
        // The active processor exits on the abort signal; wait briefly so an immediate
        // resume cannot mistake the cancelling job for work that is still running.
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && (await job.getState()) === 'active') {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
  }

  public async generateChapterScript(
    projectId: string,
    chapterNumber: number,
  ): Promise<void> {
    const state = await this.stateManagerService.getState(projectId);
    const chapter = state.chapters[String(chapterNumber)];

    if (!Number.isInteger(chapterNumber) || !chapter) {
      throw new Error(`Unknown chapter: ${chapterNumber}`);
    }

    const pending =
      await this.stateManagerService.getPendingChapters(projectId);

    if (!pending.some((item) => item.chapterNumber === chapterNumber)) {
      await this.enqueueNormalizationIfReady(projectId);

      return;
    }

    if (pending.some((item) => item.chapterNumber < chapterNumber)) {
      throw new Error(
        'Previous chapter scripts must complete before continuing',
      );
    }

    const outline = await this.readOutline(projectId);
    const objectives = outline.chapters.find(
      (item) => item.chapterNumber === chapterNumber,
    );

    if (!state.outlineCompleted || !objectives) {
      throw new Error(
        'A completed outline is required before writing chapters',
      );
    }

    await this.stateManagerService.updateState(projectId, (current) => {
      current.status = 'GENERATING_SCRIPTS';
      current.chapters[String(chapterNumber)].scriptStatus = 'PROCESSING';
      delete current.error;
    });

    try {
      let previousTail = '';

      if (chapterNumber > 1) {
        const previous = state.chapters[String(chapterNumber - 1)];
        const previousText = await fs.readFile(
          this.stateManagerService.getArtifactPath(
            projectId,
            previous.scriptFilePath,
          ),
          'utf8',
        );

        previousTail = previousText.trim().split(/\s+/).slice(-200).join(' ');
      }

      const system = await this.promptService.getSystemPrompt(
        'writer',
        state.profile.writerSystemPrompt,
      );
      const text = await this.polzaLlmService.streamText({
        model: state.profile.writerModel,
        system,
        prompt: [
          `Global outline:\n${JSON.stringify(outline)}`,
          `Current chapter objectives:\n${JSON.stringify(objectives)}`,
          `Last two hundred words of the previous chapter (continue without repeating):\n${previousTail || 'This is the opening chapter.'}`,
        ].join('\n\n'),
        reasoningEffort: 'none',
        temperature: state.profile.temperature,
      });

      await writeArtifact(
        this.stateManagerService.getArtifactPath(
          projectId,
          chapter.scriptFilePath,
        ),
        text,
      );
      await this.stateManagerService.updateState(projectId, (current) => {
        current.chapters[String(chapterNumber)].scriptStatus = 'COMPLETED';
        delete current.error;
      });
    } catch (error) {
      await this.markFailed(projectId, error, chapterNumber);

      throw error;
    }

    // Keep handoff failures separate: a completed script must stay completed.
    await this.enqueueNormalizationIfReady(projectId);
  }

  public async generateProjectScripts(projectId: string): Promise<void> {
    const outline = await this.generateOutline(projectId);

    for (const chapter of outline.chapters) {
      await this.generateChapterScript(projectId, chapter.chapterNumber);
    }
  }

  private async readOutline(projectId: string): Promise<Outline> {
    const text = await fs.readFile(
      this.stateManagerService.getArtifactPath(projectId, 'outline.json'),
      'utf8',
    );

    return parseOutline(text);
  }

  private async enqueueNormalizationIfReady(projectId: string): Promise<void> {
    const state = await this.stateManagerService.getState(projectId);

    if (!state.outlineCompleted || Object.keys(state.chapters).length === 0) {
      return;
    }

    const pending =
      await this.stateManagerService.getPendingChapters(projectId);

    if (pending.length === 0) {
      await this.scriptQueueService.enqueueNormalization(projectId);
    }
  }

  private async markFailed(
    projectId: string,
    error: unknown,
    chapterNumber?: number,
  ): Promise<void> {
    await this.stateManagerService.updateState(projectId, (current) => {
      current.status = 'FAILED';
      current.error = error instanceof Error ? error.message : String(error);

      if (chapterNumber !== undefined) {
        current.chapters[String(chapterNumber)].scriptStatus = 'FAILED';
      }
    });
  }
}
