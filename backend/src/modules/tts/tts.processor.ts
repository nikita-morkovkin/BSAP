import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { existsSync, promises as fs } from 'node:fs';
import { PIPELINE_JOBS } from '../queue/consts/pipeline-jobs.const';
import { StateManagerService } from '../state/state-manager.service';
import type { TtsJob } from '../text/types/tts-job.type';
import { AudioProbeService } from './audio-probe.service';
import { ChapterAssemblyQueueService } from './chapter-assembly-queue.service';
import { KokoroTtsAdapter } from './kokoro-tts.adapter';

@Processor(PIPELINE_JOBS.ttsQueue, { concurrency: 1 })
export class TtsProcessor extends WorkerHost {
  constructor(
    private readonly stateManagerService: StateManagerService,
    private readonly kokoroTtsAdapter: KokoroTtsAdapter,
    private readonly audioProbeService: AudioProbeService,
    private readonly chapterAssemblyQueueService: ChapterAssemblyQueueService,
  ) {
    super();
  }

  public async process(job: Job<TtsJob>): Promise<void> {
    if (job.name !== PIPELINE_JOBS.synthesizeChunk) {
      throw new Error(`Unsupported TTS job: ${job.name}`);
    }

    const { projectId, chapterNumber, chunkId } = job.data;
    const state = await this.stateManagerService.getState(projectId);
    const chapter = state.chapters[String(chapterNumber)];
    const chunk = chapter?.chunks.find((candidate) => candidate.id === chunkId);

    if (!chunk) {
      throw new Error(`Unknown TTS chunk: ${chapterNumber}/${chunkId}`);
    }

    const outputPath = this.stateManagerService.getArtifactPath(
      projectId,
      chunk.filePath,
    );
    let durationMs: number | undefined;

    if (chunk.status === 'COMPLETED') {
      try {
        durationMs = await this.audioProbeService.getDurationMs(outputPath);
      } catch {
        // A missing, truncated, or invalid completed artifact must be regenerated.
      }
    }

    try {
      if (durationMs === undefined) {
        await this.stateManagerService.updateState(projectId, (current) => {
          const target = current.chapters[String(chapterNumber)];
          const targetChunk = target.chunks.find(
            (candidate) => candidate.id === chunkId,
          )!;

          targetChunk.status = 'PROCESSING';
          targetChunk.durationMs = 0;
          target.ttsStatus = 'PROCESSING';
          target.durationMs = 0;
          current.status = 'SYNTHESIZING_AUDIO';

          delete current.error;
        });

        try {
          await this.kokoroTtsAdapter.synthesize(
            chunk.text,
            outputPath,
            state.profile,
          );

          durationMs = await this.audioProbeService.getDurationMs(outputPath);
        } catch (error) {
          await fs.rm(outputPath, { force: true }).catch(() => undefined);

          throw error;
        }
      }

      await this.stateManagerService.markChunkCompleted(
        projectId,
        chapterNumber,
        chunkId,
        durationMs,
      );

      await this.stateManagerService.updateState(projectId, (current) => {
        if (current.status === 'FAILED') {
          current.status = 'SYNTHESIZING_AUDIO';
        }

        delete current.error;
      });

      await this.enqueueCompletedChapter(projectId, chapterNumber);
    } catch (error) {
      await this.stateManagerService.updateState(projectId, (current) => {
        const target = current.chapters[String(chapterNumber)];
        const targetChunk = target.chunks.find(
          (candidate) => candidate.id === chunkId,
        )!;

        if (targetChunk.status !== 'COMPLETED') {
          targetChunk.status = 'FAILED';
          target.ttsStatus = 'FAILED';
        }

        current.status = 'FAILED';
        current.error = error instanceof Error ? error.message : String(error);
      });

      throw error;
    }
  }

  private async enqueueCompletedChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<void> {
    const state = await this.stateManagerService.getState(projectId);
    const chapters = Object.values(state.chapters);
    const chapter = state.chapters[String(chapterNumber)];
    const isReady = chapter.chunks.every(
      (chunk) =>
        chunk.status === 'COMPLETED' &&
        existsSync(
          this.stateManagerService.getArtifactPath(projectId, chunk.filePath),
        ),
    );

    if (!isReady) {
      return;
    }

    const allCompleted = chapters.every(
      (candidate) =>
        candidate.chunks.length > 0 &&
        candidate.chunks.every(
          (chunk) =>
            chunk.status === 'COMPLETED' &&
            existsSync(
              this.stateManagerService.getArtifactPath(
                projectId,
                chunk.filePath,
              ),
            ),
        ),
    );

    await this.stateManagerService.updateState(projectId, (current) => {
      if (current.status !== 'COMPLETED') {
        current.status = allCompleted ? 'MASTERING' : 'SYNTHESIZING_AUDIO';
      }

      delete current.error;
    });

    if (
      chapter.ttsStatus === 'COMPLETED' &&
      existsSync(
        this.stateManagerService.getArtifactPath(
          projectId,
          chapter.audioFilePath,
        ),
      )
    ) {
      return;
    }

    // Revisited on retries too, so a Redis failure cannot lose the handoff.
    await this.chapterAssemblyQueueService.enqueueChapter({
      projectId,
      chapterNumber,
    });
  }
}
