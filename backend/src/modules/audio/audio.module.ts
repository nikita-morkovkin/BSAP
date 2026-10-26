import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import { StateModule } from '../state/state.module';
import { AudioProcessor } from './audio.processor';
import { FfmpegService } from './ffmpeg.service';
import { MasterProjectQueueService } from './master-project-queue.service';
import { MetadataExporterService } from './metadata-exporter.service';
import { MusicModule } from '../music/music.module';

@Module({
  imports: [
    ConfigModule,
    StateModule,
    MusicModule,
    BullModule.registerQueue({ name: PIPELINE_JOBS.audioMasteringQueue }),
  ],
  providers: [
    FfmpegService,
    MetadataExporterService,
    MasterProjectQueueService,
    AudioProcessor,
  ],
  exports: [FfmpegService, MetadataExporterService, MasterProjectQueueService],
})
export class AudioModule {}
