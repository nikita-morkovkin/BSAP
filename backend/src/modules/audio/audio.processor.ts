import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts';
import { StateManagerService } from '../state/state-manager.service';
import { FfmpegService } from './ffmpeg.service';
import { AudioJob } from './types';

@Processor(PIPELINE_JOBS.audioMasteringQueue, { concurrency: 1 })
export class AudioProcessor extends WorkerHost {
  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly stateManagerService: StateManagerService,
  ) {
    super();
  }

  public async process(job: Job<AudioJob>): Promise<void> {
    try {
      if (
        job.name === PIPELINE_JOBS.assembleChapter &&
        job.data.chapterNumber !== undefined
      ) {
        await this.ffmpegService.assembleChapter(
          job.data.projectId,
          job.data.chapterNumber,
        );

        return;
      }

      if (job.name === PIPELINE_JOBS.masterProject) {
        await this.ffmpegService.masterProject(job.data.projectId);

        return;
      }

      throw new Error(`Unsupported audio job: ${job.name}`);
    } catch (error) {
      await this.stateManagerService.updateState(
        job.data.projectId,
        (state) => {
          state.status = 'FAILED';
          state.error = error instanceof Error ? error.message : String(error);
        },
      );

      throw error;
    }
  }
}
