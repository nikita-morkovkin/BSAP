import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AudioModule } from '../../modules/audio/audio.module';
import { LlmModule } from '../../modules/llm/llm.module';
import { QueueModule } from '../../modules/queue/queue.module';
import { ProjectsModule } from '../../modules/projects/projects.module';
import { StateModule } from '../../modules/state/state.module';
import { TextModule } from '../../modules/text/text.module';
import { TtsModule } from '../../modules/tts/tts.module';
import { VideoModule } from '../../modules/video/video.module';
import { HealthController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
        },
      }),
    }),
    QueueModule,
    StateModule,
    LlmModule,
    TextModule,
    TtsModule,
    AudioModule,
    ProjectsModule,
    VideoModule,
  ],
  controllers: [HealthController],
  providers: [AppService],
})
export class AppModule {}
