import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import { StateModule } from '../state/state.module';
import { AudioProbeService } from './audio-probe.service';
import { ChapterAssemblyQueueService } from './chapter-assembly-queue.service';
import { KokoroTtsAdapter } from './kokoro-tts.adapter';
import { TtsProcessor } from './tts.processor';

@Module({
  imports: [
    ConfigModule,
    StateModule,
    BullModule.registerQueue(
      { name: PIPELINE_JOBS.ttsQueue },
      { name: PIPELINE_JOBS.audioMasteringQueue },
    ),
  ],
  providers: [
    KokoroTtsAdapter,
    AudioProbeService,
    ChapterAssemblyQueueService,
    TtsProcessor,
  ],
  exports: [KokoroTtsAdapter, AudioProbeService],
})
export class TtsModule {}
