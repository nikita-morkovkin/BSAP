import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { HEALTH_CHECK_QUEUE } from './consts/queue.consts';

@Processor(HEALTH_CHECK_QUEUE)
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name);

  process(): Promise<string> {
    this.logger.log('BullMQ & Redis pipeline connection verified');
    return Promise.resolve('verified');
  }
}
