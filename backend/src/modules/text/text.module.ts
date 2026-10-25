import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import { StateModule } from '../state/state.module';
import { ChunkerService } from './chunker.service';
import { TextNormalizerService } from './text-normalizer.service';
import { TextPipelineService } from './text-pipeline.service';
import { TextProcessor } from './text.processor';
import { TtsQueueService } from './tts-queue.service';

@Module({
  imports: [
    StateModule,
    BullModule.registerQueue(
      { name: PIPELINE_JOBS.textQueue },
      { name: PIPELINE_JOBS.ttsQueue },
    ),
  ],
  providers: [
    TextNormalizerService,
    ChunkerService,
    TextPipelineService,
    TextProcessor,
    TtsQueueService,
  ],
  exports: [TextNormalizerService, ChunkerService, TextPipelineService],
})
export class TextModule {}
