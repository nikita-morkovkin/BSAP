import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PIPELINE_JOBS } from '../queue/consts';
import { StateManagerService } from '../state/state-manager.service';
import type { State } from '../state/types';
import { UpdateProjectMusicDto } from './dto/update-project-music.dto';
import { MusicService } from './music.service';
import { musicHash, safeMusicPath } from './utils';

@Injectable()
export class ProjectMusicService {
  constructor(
    private readonly manager: StateManagerService,
    private readonly library: MusicService,
    @InjectQueue(PIPELINE_JOBS.scriptQueue)
    private readonly scripts: Queue<{ projectId: string }>,
    @InjectQueue(PIPELINE_JOBS.textQueue)
    private readonly text: Queue<{ projectId: string }>,
    @InjectQueue(PIPELINE_JOBS.ttsQueue)
    private readonly tts: Queue<{ projectId: string }>,
    @InjectQueue(PIPELINE_JOBS.audioMasteringQueue)
    private readonly audio: Queue<{ projectId: string }>,
  ) {}

  private operation: Promise<unknown> = Promise.resolve();

  public async isBusy(projectId: string): Promise<boolean> {
    const state = await this.read(projectId);

    if (!['IDLE', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status)) {
      return true;
    }

    for (const queue of [this.scripts, this.text, this.tts, this.audio]) {
      const jobs = await queue.getJobs([
        'active',
        'wait',
        'delayed',
        'prioritized',
        'waiting-children',
      ]);

      if (jobs.some((job) => job.data.projectId === projectId)) {
        return true;
      }
    }

    return false;
  }

  public async initialize(projectId: string, ids?: string[]): Promise<State> {
    const state = await this.read(projectId);

    if (state.music) {
      return state;
    }

    const music = await this.library.snapshot(
      this.manager.getProjectDirectory(projectId),
      ids,
      0,
    );

    return this.manager.updateState(projectId, (current) => {
      if (!current.music) {
        current.music = music;
      }
    });
  }

  public async paths(projectId: string): Promise<string[]> {
    const state = await this.initialize(projectId);
    const root = this.manager.getProjectDirectory(projectId);
    const paths: string[] = [];

    for (const snapshot of state.music!.snapshots) {
      try {
        const path = await safeMusicPath(root, snapshot.filePath);

        if ((await musicHash(path)) !== snapshot.sha256) {
          throw new Error('Checksum mismatch');
        }

        paths.push(path);
      } catch {
        throw new Error(
          `Project music snapshot "${snapshot.displayName}" (${snapshot.id}, version ${snapshot.version}) is missing, unsafe, or corrupt. Restore the project copy or explicitly remove it.`,
        );
      }
    }

    return paths;
  }

  public async update(
    projectId: string,
    payload: UpdateProjectMusicDto,
  ): Promise<State> {
    return this.idle(projectId, async () => {
      const state = await this.read(projectId);
      const revision = state.music?.revision ?? 0;

      if (revision !== payload.revision) {
        throw new ConflictException(
          'Soundtrack changed. Refresh the project before saving again.',
        );
      }

      if (
        state.music &&
        JSON.stringify(state.music.selectedTrackIds) ===
          JSON.stringify(payload.selectedTrackIds)
      ) {
        return state;
      }

      const root = this.manager.getProjectDirectory(projectId);
      const music = await this.library.snapshot(
        root,
        payload.selectedTrackIds,
        revision + 1,
        state.music,
      );

      try {
        const updated = await this.manager.updateState(projectId, (current) => {
          if ((current.music?.revision ?? 0) !== revision) {
            throw new ConflictException(
              'Soundtrack revision changed during save',
            );
          }

          current.music = music;
          current.outputFiles = {};
          current.mixNeedsRebuild = true;

          delete current.mixRevision;
        });

        // State is the commit point. Unreachable project copies are recovered on next selection save.
        await this.cleanup(
          root,
          music.snapshots.map((track) => track.filePath),
        ).catch(() => undefined);
        await Promise.all(
          [
            'ambient_cycle.wav',
            'master_final.wav',
            'master_final.flac',
            'music_manifest.json',
            'bundle.zip',
          ].map((file) => fs.rm(join(root, 'output', file), { force: true })),
        ).catch(() => undefined);

        return updated;
      } catch (error) {
        const committed = await this.read(projectId);

        await this.cleanup(
          root,
          committed.music?.snapshots.map((track) => track.filePath) ?? [],
        );

        throw error;
      }
    });
  }

  public async idle<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    const next = this.operation.then(async () => {
      const paused: Queue[] = [];
      const queues = [this.scripts, this.text, this.tts, this.audio];

      try {
        for (const queue of queues) {
          if (!(await queue.isPaused())) {
            await queue.pause();

            paused.push(queue);
          }
        }

        const state = await this.read(projectId);

        if (
          !['IDLE', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status)
        ) {
          throw new ConflictException(
            'Production is active. Wait for it to finish before changing music or rebuilding.',
          );
        }

        for (const queue of queues) {
          const jobs = await queue.getJobs([
            'active',
            'wait',
            'delayed',
            'prioritized',
            'waiting-children',
          ]);

          if (jobs.some((job) => job.data.projectId === projectId)) {
            throw new ConflictException(
              'Production is queued or active. Music cannot be changed or rebuilt yet.',
            );
          }
        }

        return await work();
      } finally {
        await Promise.all(paused.map((queue) => queue.resume()));
      }
    });

    this.operation = next.catch(() => undefined);

    return next;
  }

  private async read(projectId: string): Promise<State> {
    try {
      return await this.manager.getState(projectId);
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

  private async cleanup(root: string, paths: string[]): Promise<void> {
    const directory = join(root, 'music');
    const retained = new Set(paths.map((path) => path.split('/')[1]));

    for (const name of await fs
      .readdir(directory)
      .catch(() => [] as string[])) {
      if (!retained.has(name)) {
        await fs.rm(join(directory, name), { recursive: true, force: true });
      }
    }
  }
}
