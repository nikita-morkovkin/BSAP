import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import { TextPipelineService } from './text-pipeline.service';
import type { TextJob } from './types/text-job.type';

@Processor(PIPELINE_JOBS.textQueue, { concurrency: 1 })
export class TextProcessor extends WorkerHost {
  constructor(private readonly textPipelineService: TextPipelineService) {
    super();
  }

  public async process(job: Job<TextJob>): Promise<void> {
    if (job.name !== PIPELINE_JOBS.normalizeProject) {
      throw new Error(`Unsupported text job: ${job.name}`);
    }

    await this.textPipelineService.normalizeProject(job.data.projectId);
  }
}
