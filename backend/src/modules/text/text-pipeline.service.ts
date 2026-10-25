import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { writeArtifact } from '../../utils/write-artifact.util';
import { StateManagerService } from '../state/state-manager.service';
import { Chunk } from '../state/types';
import { ChunkerService } from './chunker.service';
import { TextNormalizerService } from './text-normalizer.service';
import { TtsQueueService } from './tts-queue.service';

@Injectable()
export class TextPipelineService {
  constructor(
    private readonly stateManagerService: StateManagerService,
    private readonly textNormalizerService: TextNormalizerService,
    private readonly chunkerService: ChunkerService,
    private readonly ttsQueueService: TtsQueueService,
  ) {}

  public async normalizeProject(projectId: string): Promise<void> {
    try {
      const state = await this.stateManagerService.getState(projectId);
      const chapters = Object.values(state.chapters).sort(
        (left, right) => left.chapterNumber - right.chapterNumber,
      );

      const pending =
        await this.stateManagerService.getPendingChapters(projectId);

      if (
        !state.outlineCompleted ||
        chapters.length === 0 ||
        pending.length > 0
      ) {
        throw new Error(
          'All chapter scripts must be completed before normalization',
        );
      }

      // Persist every chapter before handing any work to a TTS consumer.
      for (const chapter of chapters) {
        const raw = await fs.readFile(
          this.stateManagerService.getArtifactPath(
            projectId,
            chapter.scriptFilePath,
          ),
          'utf8',
        );

        const normalized = this.textNormalizerService.normalize(raw);
        const blocks = this.chunkerService.chunk(
          normalized,
          state.profile.maxChunkChars,
        );

        const prefix = `ch_${String(chapter.chapterNumber).padStart(2, '0')}`;
        const chunks: Chunk[] = blocks.map((block, index) => {
          const id = `${prefix}_chunk_${String(index + 1).padStart(3, '0')}`;

          return {
            id,
            index,
            text: block.text,
            pauseAfterMs: block.pauseAfterMs,
            status: 'PENDING',
            filePath: `chunks/${id}.wav`,
            durationMs: 0,
          };
        });

        if (chunks.length === 0) {
          throw new Error(
            `Chapter ${chapter.chapterNumber} contains no narration`,
          );
        }

        await writeArtifact(
          this.stateManagerService.getArtifactPath(
            projectId,
            `chapters/${prefix}_clean.json`,
          ),
          `${JSON.stringify(chunks, null, 2)}\n`,
        );

        await this.stateManagerService.updateState(projectId, (current) => {
          const target = current.chapters[String(chapter.chapterNumber)];
          const unchanged =
            target.chunks.length === chunks.length &&
            target.chunks.every(
              (chunk, index) =>
                chunk.id === chunks[index].id &&
                chunk.text === chunks[index].text &&
                chunk.pauseAfterMs === chunks[index].pauseAfterMs,
            );

          if (!unchanged) {
            if (target.chunks.some((chunk) => chunk.status === 'PROCESSING')) {
              throw new Error('Cannot replace chunks while TTS is processing');
            }

            target.chunks = chunks;
            target.ttsStatus = 'PENDING';
            target.durationMs = 0;
          }
        });
      }

      await this.stateManagerService.updateState(projectId, (current) => {
        if (current.status !== 'MASTERING' && current.status !== 'COMPLETED') {
          current.status = 'SYNTHESIZING_AUDIO';
        }

        delete current.error;
      });

      for (const chapter of chapters) {
        const chunks = await this.stateManagerService.getPendingChunks(
          projectId,
          chapter.chapterNumber,
        );

        for (const chunk of chunks) {
          await this.ttsQueueService.enqueueChunk({
            projectId,
            chapterNumber: chapter.chapterNumber,
            chunkId: chunk.id,
          });
        }
      }
    } catch (error) {
      await this.stateManagerService.updateState(projectId, (current) => {
        current.status = 'FAILED';
        current.error = error instanceof Error ? error.message : String(error);
      });

      throw error;
    }
  }
}
