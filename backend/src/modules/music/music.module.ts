import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { PIPELINE_JOBS } from '../queue/consts';
import { StateModule } from '../state/state.module';
import { MusicProbeService } from './music-probe.service';
import { MusicController } from './music.controller';
import { MusicService } from './music.service';
import { ProjectMusicService } from './project-music.service';
import { MusicUploadStorage } from './music-upload.storage';

@Module({
  imports: [
    ConfigModule,
    StateModule,
    BullModule.registerQueue(
      ...[
        PIPELINE_JOBS.scriptQueue,
        PIPELINE_JOBS.textQueue,
        PIPELINE_JOBS.ttsQueue,
        PIPELINE_JOBS.audioMasteringQueue,
      ].map((name) => ({ name })),
    ),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: new MusicUploadStorage(config),
        limits: {
          fileSize: Number(config.get('MUSIC_MAX_UPLOAD_BYTES') ?? 536870912),
          files: 1,
          fields: 1,
          fieldSize: 1024,
          parts: 2,
        },
      }),
    }),
  ],
  controllers: [MusicController],
  providers: [MusicService, MusicProbeService, ProjectMusicService],
  exports: [MusicService, ProjectMusicService],
})
export class MusicModule {}
