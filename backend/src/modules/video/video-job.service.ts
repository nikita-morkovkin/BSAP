import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { StateManagerService } from '../state/state-manager.service';
import { videoStyleSchema } from './schemas';
import type { VideoJobState } from './types/video-job.type';
import type { VideoTask } from './types/video-task.type';
import type { VideoStyleConfig } from './types/video-style.type';

@Injectable()
export class VideoJobService implements OnModuleInit {
  constructor(
    private readonly state: StateManagerService,
    @InjectQueue('video') private readonly queue: Queue<VideoTask>,
  ) {}

  private readonly aborts = new Map<string, AbortController>();

  public async onModuleInit(): Promise<void> {
    for (const state of await this.state.listProjects()) {
      const job = state.video?.job;

      if (
        job &&
        !['done', 'failed', 'cancelled', 'queued'].includes(job.stage)
      ) {
        await this.update(state.projectId, job.jobId, {
          stage: 'failed',
          error:
            'API restarted during video rendering. Retry to reuse completed cache files.',
        });
      }
    }
  }

  public async start(
    projectId: string,
    kind: VideoTask['kind'],
    style?: VideoStyleConfig,
  ): Promise<VideoJobState> {
    const previous = (await this.state.getState(projectId)).video?.job;

    if (previous && this.aborts.has(previous.jobId)) {
      throw new ConflictException(
        'The previous video worker is still stopping',
      );
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job: VideoJobState = {
      jobId,
      projectId,
      kind,
      stage: 'queued',
      progress: 0,
      stageProgress: 0,
      startedAt: now,
      updatedAt: now,
    };
    let selected = videoStyleSchema.parse({});

    await this.state.updateState(projectId, (current) => {
      if (
        current.video?.job &&
        !['done', 'failed', 'cancelled'].includes(current.video.job.stage)
      ) {
        throw new ConflictException(
          'A video job is already active for this project',
        );
      }

      selected = style ?? current.video?.style ?? selected;
      current.video = { ...current.video, style: selected, job };
    });

    try {
      await this.queue.add(
        kind,
        { projectId, jobId, kind, style: selected },
        { jobId, removeOnComplete: 100, removeOnFail: 100 },
      );
    } catch (error) {
      await this.update(projectId, jobId, {
        stage: 'failed',
        error: 'Could not enqueue video job',
      });

      throw error;
    }

    return job;
  }

  public async get(projectId: string, jobId: string): Promise<VideoJobState> {
    const job = (await this.state.getState(projectId)).video?.job;

    if (!job || job.jobId !== jobId) {
      throw new NotFoundException('Video job not found');
    }

    return job;
  }

  public async update(
    projectId: string,
    jobId: string,
    patch: Partial<VideoJobState>,
  ): Promise<void> {
    await this.state.updateState(projectId, (current) => {
      const job = current.video?.job;

      if (job?.jobId === jobId && job.stage !== 'cancelled') {
        Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      }
    });
  }

  public async cancel(
    projectId: string,
    jobId: string,
  ): Promise<VideoJobState> {
    const job = await this.get(projectId, jobId);

    if (['done', 'failed', 'cancelled'].includes(job.stage)) {
      return job;
    }

    this.aborts.get(jobId)?.abort();

    await this.update(projectId, jobId, {
      stage: 'cancelled',
      message: 'Cancellation requested',
    });

    const queued = await this.queue.getJob(jobId);

    if (queued && (await queued.getState()) === 'waiting') {
      await queued.remove().catch(() => undefined);
    }

    return this.get(projectId, jobId);
  }

  public attach(jobId: string): AbortSignal {
    const abort = new AbortController();

    this.aborts.set(jobId, abort);

    return abort.signal;
  }

  public detach(jobId: string): void {
    this.aborts.delete(jobId);
  }
}
