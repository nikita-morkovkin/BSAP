import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule,
    StateModule,
    LlmModule,
    TextModule,
    TtsModule,
    AudioModule,
  ],
  controllers: [ProjectsController, MediaController],
  providers: [ProjectsService, MediaService],
})
export class ProjectsModule {}
