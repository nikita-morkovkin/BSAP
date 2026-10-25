import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts';
import { AssembleChapterJob } from './types';

@Injectable()
export class ChapterAssemblyQueueService {
  constructor(
    @InjectQueue(PIPELINE_JOBS.audioMasteringQueue)
    private readonly queue: Queue<AssembleChapterJob>,
  ) {}

  public async enqueueChapter(data: AssembleChapterJob): Promise<void> {
    const jobId = `assemble-${data.projectId}-ch-${data.chapterNumber}`;
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

    await this.queue.add(PIPELINE_JOBS.assembleChapter, data, {
      jobId,
      attempts: 6,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: false,
      removeOnFail: false,
    });
  }
}
