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
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { VideoFullService } from './video-full.service';
import { VideoEffectsService } from './video-effects.service';
import { VideoEffectsController } from './video-effects.controller';
import { GreetingController } from './greeting.controller';
import { GreetingAudioService } from './greeting-audio.service';
import { GreetingVadService } from './greeting-vad.service';
import { GreetingRendererService } from './greeting-renderer.service';
import { GreetingCompositorService } from './greeting-compositor.service';
import { GreetingPreviewService } from './greeting-preview.service';
import { TtsModule } from '../tts/tts.module';
import { TextModule } from '../text/text.module';
import { VideoInputsService } from './video-inputs.service';
import { EffectGeneratorService } from './effect-generator.service';
import { SyncLipSyncProvider } from './sync-lip-sync.provider';
import { ExternalLipSyncService } from './external-lip-sync.service';

@Module({
  imports: [
    StateModule,
    AudioModule,
    TtsModule,
    TextModule,
    BullModule.registerQueue({ name: 'video' }),
  ],
  controllers: [
    VideoController,
    ExportController,
    VideoEffectsController,
    GreetingController,
  ],
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
    ExportService,
    VideoFullService,
    VideoEffectsService,
    GreetingAudioService,
    GreetingVadService,
    GreetingRendererService,
    GreetingCompositorService,
    GreetingPreviewService,
    VideoInputsService,
    EffectGeneratorService,
    SyncLipSyncProvider,
    ExternalLipSyncService,
  ],
})
export class VideoModule {}
