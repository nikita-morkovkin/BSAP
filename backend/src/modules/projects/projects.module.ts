import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PIPELINE_JOBS } from '../queue/consts';
import { CatalogService } from './catalog.service';
import { SettingsController } from './settings.controller';
import { ProjectDeletionService } from './project-deletion.service';
import { ConfigModule } from '@nestjs/config';
import { AudioModule } from '../audio/audio.module';
import { LlmModule } from '../llm/llm.module';
import { StateModule } from '../state/state.module';
import { TextModule } from '../text/text.module';
import { TtsModule } from '../tts/tts.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { MusicModule } from '../music/music.module';
import { ProjectMusicController } from './project-music.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      ...[
        PIPELINE_JOBS.scriptQueue,
        PIPELINE_JOBS.textQueue,
        PIPELINE_JOBS.ttsQueue,
        PIPELINE_JOBS.audioMasteringQueue,
      ].map((name) => ({ name })),
    ),
    ConfigModule,
    StateModule,
    LlmModule,
    TextModule,
    TtsModule,
    AudioModule,
    MusicModule,
  ],
  controllers: [
    ProjectsController,
    MediaController,
    SettingsController,
    ProjectMusicController,
  ],
  providers: [
    ProjectsService,
    MediaService,
    CatalogService,
    ProjectDeletionService,
  ],
})
export class ProjectsModule {}
