import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AudioModule } from '../audio/audio.module';
import { StateModule } from '../state/state.module';
import { VideoController } from './video.controller';
import { VideoLibraryService } from './video-library.service';
import { VideoNormalizerService } from './video-normalizer.service';
import { VideoPlannerService } from './video-planner.service';
import { VideoChunkRendererService } from './video-chunk-renderer.service';
import { VideoFinalMuxService } from './video-final-mux.service';
import { VideoPreviewService } from './video-preview.service';
import { VideoJobService } from './video-job.service';
import { VideoProcessor } from './video.processor';
import { VideoUploadInterceptor } from './video-upload.interceptor';

@Module({
  imports: [
    StateModule,
    AudioModule,
    BullModule.registerQueue({ name: 'video' }),
  ],
  controllers: [VideoController],
  providers: [
    VideoLibraryService,
    VideoNormalizerService,
    VideoPlannerService,
    VideoChunkRendererService,
    VideoFinalMuxService,
    VideoPreviewService,
    VideoJobService,
    VideoProcessor,
    VideoUploadInterceptor,
  ],
})
export class VideoModule {}
