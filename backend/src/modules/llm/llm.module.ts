import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import { StateModule } from '../state/state.module';
import { PolzaLlmService } from './polza-llm.service';
import { PromptService } from './prompt.service';
import { ScriptGeneratorService } from './script-generator.service';
import { ScriptQueueService } from './script-queue.service';
import { ScriptProcessor } from './script.processor';

@Module({
  imports: [
    ConfigModule,
    StateModule,
    BullModule.registerQueue(
      { name: PIPELINE_JOBS.scriptQueue },
      { name: PIPELINE_JOBS.textQueue },
    ),
  ],
  providers: [
    PolzaLlmService,
    PromptService,
    ScriptGeneratorService,
    ScriptQueueService,
    ScriptProcessor,
  ],
  exports: [
    PolzaLlmService,
    ScriptGeneratorService,
    ScriptQueueService,
    PromptService,
  ],
})
export class LlmModule {}
