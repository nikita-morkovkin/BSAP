import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, promises as fs } from 'fs';
import { basename, join, resolve } from 'path';
import { artifactPathSchema, profileSchema, stateSchema } from './schemas';
import type { Chapter, Chunk, Profile, State } from './types';

@Injectable()
export class StateManagerService {
  constructor(private readonly configService: ConfigService) {}

  private readonly operations = new Map<string, Promise<void>>();

  public async initProject(
    topic: string,
    profile: Profile,
    title?: string,
  ): Promise<State> {
    const validatedTopic = stateSchema.shape.topic.parse(topic);
    const validatedTitle = title
      ? stateSchema.shape.title.unwrap().parse(title)
      : undefined;
    const validatedProfile = profileSchema.parse(profile);
    const root = this.getProjectsDirectory();

    return this.withLock(root, async () => {
      await fs.mkdir(root, { recursive: true });

      const entries = await fs.readdir(root, { withFileTypes: true });

      let sequence =
        entries.reduce((maximum, entry) => {
          const match = /^(\d+)-/.exec(entry.name);

          return match ? Math.max(maximum, Number(match[1])) : maximum;
        }, 0) + 1;

      const slug =
        (validatedTitle ?? validatedTopic)
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80)
          .replace(/-$/, '') || 'project';

      let projectId: string;

      while (true) {
        projectId = `${String(sequence).padStart(3, '0')}-${slug}`;

        try {
          await fs.mkdir(join(root, projectId));

          break;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 'EEXIST'
          ) {
            throw error;
          }

          sequence += 1;
        }
      }

      const now = new Date().toISOString();

      const state = stateSchema.parse({
        projectId,
        topic: validatedTopic,
        ...(validatedTitle ? { title: validatedTitle } : {}),
        createdAt: now,
        updatedAt: now,
        status: 'IDLE',
        profile: validatedProfile,
        outlineCompleted: false,
        chapters: {},
        outputFiles: {},
      });

      await Promise.all(
        ['chapters', 'chunks', 'chunks/silence', 'output'].map((directory) =>
          fs.mkdir(join(root, projectId, directory), { recursive: true }),
        ),
      );
      await this.writeState(state);

      return state;
    });
  }

  public async getState(projectId: string): Promise<State> {
    const contents = await fs.readFile(
      join(this.getProjectDirectory(projectId), 'state.json'),
      'utf8',
    );
    const state = stateSchema.parse(JSON.parse(contents));

    if (state.projectId !== projectId) {
      throw new Error('State projectId does not match its project directory');
    }

    return state;
  }

  public async listProjects(): Promise<State[]> {
    const root = this.getProjectsDirectory();

    await fs.mkdir(root, { recursive: true });

    const entries = await fs.readdir(root, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            stateSchema.shape.projectId.safeParse(entry.name).success,
        )
        .map((entry) => this.getState(entry.name)),
    );

    return projects.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  public async updateState(
    projectId: string,
    update: (state: State) => void,
  ): Promise<State> {
    return this.withLock(this.getProjectDirectory(projectId), async () => {
      const state = await this.getState(projectId);

      update(state);

      if (state.projectId !== projectId) {
        throw new Error('A project ID cannot be changed');
      }

      state.updatedAt = new Date(
        Math.max(Date.now(), Date.parse(state.updatedAt)),
      ).toISOString();

      const validated = stateSchema.parse(state);

      await this.writeState(validated);

      return validated;
    });
  }

  public async deleteProject(projectId: string): Promise<void> {
    const directory = this.getProjectDirectory(projectId);
    await this.withLock(directory, async () => {
      await this.getState(projectId);
      await fs.rm(directory, { recursive: true });
    });
  }

  public async getPendingChapters(projectId: string): Promise<Chapter[]> {
    const state = await this.getState(projectId);

    return Object.values(state.chapters)
      .filter(
        (chapter) =>
          chapter.scriptStatus !== 'COMPLETED' ||
          !existsSync(this.getArtifactPath(projectId, chapter.scriptFilePath)),
      )
      .sort((left, right) => left.chapterNumber - right.chapterNumber);
  }

  public async getPendingChunks(
    projectId: string,
    chapterNumber: number,
  ): Promise<Chunk[]> {
    const state = await this.getState(projectId);
    const chapter = this.getChapter(state, chapterNumber);

    return chapter.chunks
      .filter(
        (chunk) =>
          chunk.status !== 'COMPLETED' ||
          !existsSync(this.getArtifactPath(projectId, chunk.filePath)),
      )
      .sort((left, right) => left.index - right.index);
  }

  public async markChunkCompleted(
    projectId: string,
    chapterNumber: number,
    chunkId: string,
    durationMs: number,
  ): Promise<State> {
    this.validateDuration(durationMs);

    return this.updateState(projectId, (state) => {
      const chapter = this.getChapter(state, chapterNumber);
      const chunk = chapter.chunks.find(
        (candidate) => candidate.id === chunkId,
      );

      if (!chunk) {
        throw new Error(`Unknown chunk: ${chunkId}`);
      }

      if (!existsSync(this.getArtifactPath(projectId, chunk.filePath))) {
        throw new Error(`Chunk audio file is missing: ${chunk.filePath}`);
      }

      if (chunk.status === 'COMPLETED' && chunk.durationMs === durationMs) {
        return;
      }

      chunk.status = 'COMPLETED';
      chunk.durationMs = durationMs;
      chapter.ttsStatus = 'PENDING';
      chapter.durationMs = 0;
    });
  }

  public async markChapterAudioCompleted(
    projectId: string,
    chapterNumber: number,
    durationMs: number,
  ): Promise<State> {
    this.validateDuration(durationMs);

    return this.updateState(projectId, (state) => {
      const chapter = this.getChapter(state, chapterNumber);

      if (!existsSync(this.getArtifactPath(projectId, chapter.audioFilePath))) {
        throw new Error(
          `Chapter audio file is missing: ${chapter.audioFilePath}`,
        );
      }

      if (
        chapter.chunks.length === 0 ||
        chapter.chunks.some(
          (chunk) =>
            chunk.status !== 'COMPLETED' ||
            !existsSync(this.getArtifactPath(projectId, chunk.filePath)),
        )
      ) {
        throw new Error(
          'Chapter audio cannot complete while chunks are pending or missing',
        );
      }

      if (
        chapter.ttsStatus === 'COMPLETED' &&
        chapter.durationMs === durationMs
      ) {
        return;
      }

      chapter.ttsStatus = 'COMPLETED';
      chapter.durationMs = durationMs;
    });
  }

  public getProjectDirectory(projectId: string): string {
    stateSchema.shape.projectId.parse(projectId);

    return join(this.getProjectsDirectory(), projectId);
  }

  public getArtifactPath(projectId: string, filePath: string): string {
    artifactPathSchema.parse(filePath);

    return join(this.getProjectDirectory(projectId), filePath);
  }

  private async writeState(state: State): Promise<void> {
    const destination = join(
      this.getProjectDirectory(state.projectId),
      'state.json',
    );
    const temporary = `${destination}.tmp`;

    try {
      const handle = await fs.open(temporary, 'w');

      try {
        await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }

      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => undefined);

      throw error;
    }
  }

  // Nest's singleton provider serializes writers in this backend process.
  private async withLock<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operations.get(key) ?? Promise.resolve();
    let release = (): void => {};

    const current = new Promise<void>((resolveLock) => {
      release = resolveLock;
    });

    this.operations.set(key, current);

    await previous;

    try {
      return await operation();
    } finally {
      release();

      if (this.operations.get(key) === current) {
        this.operations.delete(key);
      }
    }
  }

  private getProjectsDirectory(): string {
    const workingDirectory = process.cwd();
    const defaultDirectory =
      basename(workingDirectory) === 'backend'
        ? resolve(workingDirectory, '..', 'projects')
        : join(workingDirectory, 'projects');

    return resolve(
      this.configService.get<string>('PROJECTS_DIR') ?? defaultDirectory,
    );
  }

  private getChapter(state: State, chapterNumber: number): Chapter {
    const chapter = state.chapters[String(chapterNumber)];

    if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || !chapter) {
      throw new Error(`Unknown chapter: ${chapterNumber}`);
    }

    return chapter;
  }

  private validateDuration(durationMs: number): void {
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
      throw new Error('durationMs must be a positive safe integer');
    }
  }
}
