import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import type { AudioJob } from './types';

@Injectable()
export class MasterProjectQueueService {
  constructor(
    @InjectQueue(PIPELINE_JOBS.audioMasteringQueue)
    private readonly queue: Queue<AudioJob>,
  ) {}

  public async enqueueProject(projectId: string): Promise<void> {
    const jobId = `master-${projectId}`;
    const existing = await this.queue.getJob(jobId);

    if (existing) {
      const status = await existing.getState();

      if (status === 'failed') {
        await existing.retry();

        return;
      }

      if (status !== 'completed') {
        return;
      }

      await existing.remove();
    }

    await this.queue.add(
      PIPELINE_JOBS.masterProject,
      { projectId },
      {
        jobId,
        attempts: 6,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }
}
