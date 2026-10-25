import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { enqueueRecoverableJob } from '../../utils/enqueue-recoverable-job.util';
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
    await enqueueRecoverableJob(
      this.scriptQueue,
      PIPELINE_JOBS.generateProject,
      { projectId },
      `scripts-${projectId}`,
    );
  }

  public async enqueueNormalization(projectId: string): Promise<void> {
    await enqueueRecoverableJob(
      this.textQueue,
      PIPELINE_JOBS.normalizeProject,
      { projectId },
      `normalize-${projectId}`,
    );
  }
}
