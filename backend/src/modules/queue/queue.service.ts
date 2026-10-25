import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { HEALTH_CHECK_JOB, HEALTH_CHECK_QUEUE } from './consts/queue.consts';

@Injectable()
export class QueueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(HEALTH_CHECK_QUEUE)
    private readonly healthCheckQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const job = await this.healthCheckQueue.add(
      HEALTH_CHECK_JOB,
      {},
      { removeOnFail: true },
    );

    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
      const state = await job.getState();

      if (state === 'completed') {
        await job.remove();
        return;
      }

      if (state === 'failed') {
        throw new Error(
          `BullMQ startup health check failed: ${job.failedReason}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const state = await job.getState();

    if (state !== 'completed') {
      const message = `BullMQ startup health check timed out (state: ${state})`;
      this.logger.error(message);
      throw new Error(message);
    }
  }
}
