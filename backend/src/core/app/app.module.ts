import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmModule } from '../../modules/llm/llm.module';
import { QueueModule } from '../../modules/queue/queue.module';
import { StateModule } from '../../modules/state/state.module';
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
  ],
  controllers: [HealthController],
  providers: [AppService],
})
export class AppModule {}
