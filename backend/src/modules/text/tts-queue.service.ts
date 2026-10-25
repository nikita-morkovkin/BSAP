import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts';
import type { TtsJob } from './types/tts-job.type';

@Injectable()
export class TtsQueueService {
  constructor(
    @InjectQueue(PIPELINE_JOBS.ttsQueue)
    private readonly ttsQueue: Queue<TtsJob>,
  ) {}

  public async enqueueChunk(data: TtsJob): Promise<void> {
    const jobId = `tts-${data.projectId}-${data.chunkId}`;
    const existing = await this.ttsQueue.getJob(jobId);

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

    await this.ttsQueue.add(PIPELINE_JOBS.synthesizeChunk, data, {
      jobId,
      attempts: 6,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: false,
      removeOnFail: false,
    });
  }
}
