import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { HEALTH_CHECK_QUEUE } from './consts/queue.consts';
import { QueueProcessor } from './queue.processor';
import { QueueService } from './queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: HEALTH_CHECK_QUEUE })],
  providers: [QueueProcessor, QueueService],
})
export class QueueModule {}
