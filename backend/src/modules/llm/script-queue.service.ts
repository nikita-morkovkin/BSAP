import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts';
import { ScriptJob } from './types';

@Injectable()
export class ScriptQueueService {
  constructor(
    @InjectQueue(PIPELINE_JOBS.scriptQueue)
    private readonly scriptQueue: Queue<ScriptJob>,
    @InjectQueue(PIPELINE_JOBS.textQueue)
    private readonly textQueue: Queue<{ projectId: string }>,
  ) {}

  public async enqueueProject(projectId: string): Promise<void> {
    await this.scriptQueue.add(
      PIPELINE_JOBS.generateProject,
      { projectId },
      {
        jobId: `scripts-${projectId}`,
        attempts: 6,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  public async enqueueNormalization(projectId: string): Promise<void> {
    await this.textQueue.add(
      PIPELINE_JOBS.normalizeProject,
      { projectId },
      {
        jobId: `normalize-${projectId}`,
        attempts: 6,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }
}
