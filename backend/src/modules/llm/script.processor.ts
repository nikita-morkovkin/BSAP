import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import { ScriptGeneratorService } from './script-generator.service';
import type { ScriptJob } from './types/script-job.type';

@Processor(PIPELINE_JOBS.scriptQueue, { concurrency: 1 })
export class ScriptProcessor extends WorkerHost {
  constructor(private readonly scriptGeneratorService: ScriptGeneratorService) {
    super();
  }

  public async process(job: Job<ScriptJob>): Promise<void> {
    if (job.name === PIPELINE_JOBS.generateProject) {
      await this.scriptGeneratorService.generateProjectScripts(
        job.data.projectId,
      );

      return;
    }

    if (
      job.name === PIPELINE_JOBS.generateChapter &&
      job.data.chapterNumber !== undefined
    ) {
      await this.scriptGeneratorService.generateChapterScript(
        job.data.projectId,
        job.data.chapterNumber,
      );

      return;
    }

    throw new Error(`Unsupported script job: ${job.name}`);
  }
}
