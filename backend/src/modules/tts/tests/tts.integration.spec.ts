import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue, QueueEvents } from 'bullmq';
import { promises as fs } from 'fs';
import { createServer, Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { setTimeout as delay } from 'timers/promises';
import { PIPELINE_JOBS } from '../../queue/consts/pipeline-jobs.const';
import { profileSchema } from '../../state/schemas/profile.schema';
import { StateManagerService } from '../../state/state-manager.service';
import type { TtsJob } from '../../text/types/tts-job.type';
import { AudioProbeService } from '../audio-probe.service';
import { TtsModule } from '../tts.module';
import { TtsProcessor } from '../tts.processor';
import { AssembleChapterJob } from '../types';

(process.env.BSAP_TTS_INTEGRATION === '1' ? describe : describe.skip)(
  'TTS integration: HTTP streaming, real BullMQ and ffprobe',
  () => {
    let module: TestingModule;
    let server: Server;
    let directory: string;
    let stateManager: StateManagerService;
    let projectId: string;
    let queue: Queue<TtsJob>;
    let mastering: Queue<AssembleChapterJob>;
    let events: QueueEvents;
    let requests: Record<string, unknown>[];
    let active: number;
    let maximumActive: number;
    let responseMode: 'valid' | 'short' | 'invalid' | 'error';
    let handoffCounts: number[];

    beforeAll(async () => {
      directory = await fs.mkdtemp(join(tmpdir(), 'bsap-tts-'));
      requests = [];
      active = 0;
      maximumActive = 0;
      handoffCounts = [];
      responseMode = 'valid';

      server = createServer((request, response) => {
        (async () => {
          if (request.url === '/v1/audio/voices') {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ voices: ['bm_george'] }));
            return;
          }
          const buffers: Buffer[] = [];

          for await (const part of request) {
            buffers.push(
              Buffer.isBuffer(part) ? part : Buffer.from(String(part)),
            );
          }

          requests.push(
            JSON.parse(Buffer.concat(buffers).toString()) as Record<
              string,
              unknown
            >,
          );
          active += 1;
          maximumActive = Math.max(maximumActive, active);

          await delay(30);

          if (responseMode === 'error') {
            response.writeHead(503).end('Unavailable');
          } else if (responseMode === 'invalid') {
            response.end('not WAV audio');
          } else {
            const samples = responseMode === 'short' ? 2400 : 12000;
            const wav = Buffer.alloc(44 + samples * 2);

            wav.write('RIFF', 0);
            wav.writeUInt32LE(wav.length - 8, 4);
            wav.write('WAVEfmt ', 8);
            wav.writeUInt32LE(16, 16);
            wav.writeUInt16LE(1, 20);
            wav.writeUInt16LE(1, 22);
            wav.writeUInt32LE(24000, 24);
            wav.writeUInt32LE(48000, 28);
            wav.writeUInt16LE(2, 32);
            wav.writeUInt16LE(16, 34);
            wav.write('data', 36);
            wav.writeUInt32LE(samples * 2, 40);
            response.writeHead(200, { 'Content-Type': 'audio/wav' });
            response.write(wav.subarray(0, 44));

            await delay(10);

            response.end(wav.subarray(44));
          }

          active -= 1;
        })().catch((error: unknown) =>
          response.destroy(error instanceof Error ? error : undefined),
        );
      });

      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );

      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Mock TTS server did not bind a TCP port');
      }

      const prefix = `bsap-tts-test-${process.pid}-${Date.now()}`;
      const connection = {
        host: process.env.TEST_REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.TEST_REDIS_PORT ?? 6379),
      };

      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            load: [
              () => ({
                PROJECTS_DIR: directory,
                KOKORO_TTS_URL: `http://127.0.0.1:${address.port}`,
                KOKORO_TIMEOUT_MS: 10000,
              }),
            ],
          }),
          BullModule.forRoot({ connection, prefix }),
          TtsModule,
        ],
      }).compile();

      await module.init();

      stateManager = module.get(StateManagerService);
      queue = module.get(getQueueToken(PIPELINE_JOBS.ttsQueue));
      mastering = module.get(getQueueToken(PIPELINE_JOBS.audioMasteringQueue));
      events = new QueueEvents(PIPELINE_JOBS.ttsQueue, { connection, prefix });

      await events.waitUntilReady();

      const originalAdd = mastering.add.bind(
        mastering,
      ) as Queue<AssembleChapterJob>['add'];

      jest
        .spyOn(mastering, 'add')
        .mockImplementation(async (name, data, options) => {
          const state = await stateManager.getState(projectId);

          handoffCounts.push(
            state.chapters['1'].chunks.filter(
              (chunk) => chunk.status === 'COMPLETED',
            ).length,
          );

          return originalAdd(name, data, options);
        });
    }, 30000);

    beforeEach(async () => {
      const state = await stateManager.initProject(
        'Quiet stars',
        profileSchema.parse({
          architectModel: 'architect',
          writerModel: 'writer',
          architectReasoningEffort: 'high',
          writerReasoningEffort: 'none',
          temperature: 0.7,
          architectSystemPrompt: 'Outline.',
          writerSystemPrompt: 'Narrate.',
          ttsVoice: 'bm_george*0.65+bm_lewis*0.35',
          ttsSpeed: 0.85,
          masteringConfig: {},
        }),
      );

      projectId = state.projectId;
      responseMode = 'valid';
      requests.length = 0;
      handoffCounts.length = 0;

      await stateManager.updateState(projectId, (current) => {
        current.outlineCompleted = true;
        current.status = 'SYNTHESIZING_AUDIO';
        current.chapters['1'] = {
          chapterNumber: 1,
          title: 'Stars',
          scriptStatus: 'COMPLETED',
          ttsStatus: 'PENDING',
          scriptFilePath: 'chapters/ch_01_raw.txt',
          audioFilePath: 'chapters/ch_01_master.wav',
          durationMs: 0,
          chunks: Array.from({ length: 5 }, (_, index) => ({
            id: `ch_01_chunk_${String(index + 1).padStart(3, '0')}`,
            index,
            text: `Quiet stars number ${index + 1}.`,
            pauseAfterMs: 600,
            status: 'PENDING',
            filePath: `chunks/ch_01_chunk_${String(index + 1).padStart(3, '0')}.wav`,
            durationMs: 0,
          })),
        };
      });
    });

    afterAll(async () => {
      if (module) {
        await module.get(TtsProcessor).worker.close();
        await queue.obliterate({ force: true });
        await mastering.obliterate({ force: true });
        await events.close();
        await module.close();
      }

      if (server) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }

      await fs.rm(directory, { recursive: true, force: true });
    });

    it('serializes five chunks, persists probed WAV durations, and hands off only after chunk five', async () => {
      const state = await stateManager.getState(projectId);
      const jobs = await Promise.all(
        state.chapters['1'].chunks.map((chunk) =>
          queue.add(PIPELINE_JOBS.synthesizeChunk, {
            projectId,
            chapterNumber: 1,
            chunkId: chunk.id,
          }),
        ),
      );

      await Promise.all(
        jobs.map((job) => job.waitUntilFinished(events, 30000)),
      );

      const completed = await stateManager.getState(projectId);

      expect(module.get(TtsProcessor).worker.concurrency).toBe(1);
      expect(maximumActive).toBe(1);
      expect(requests.map((request) => request.input)).toEqual(
        state.chapters['1'].chunks.map((chunk) => chunk.text),
      );
      expect(requests[0]).toMatchObject({
        model: 'kokoro',
        voice: 'bm_george*0.65+bm_lewis*0.35',
        speed: 0.85,
        response_format: 'wav',
      });
      expect(
        completed.chapters['1'].chunks.every(
          (chunk) => chunk.status === 'COMPLETED' && chunk.durationMs === 500,
        ),
      ).toBe(true);
      expect(completed.status).toBe('MASTERING');
      expect(handoffCounts).toEqual([5]);

      for (const chunk of completed.chapters['1'].chunks) {
        expect(
          await module
            .get(AudioProbeService)
            .getDurationMs(
              stateManager.getArtifactPath(projectId, chunk.filePath),
            ),
        ).toBe(500);
      }

      const replay = await queue.add(
        PIPELINE_JOBS.synthesizeChunk,
        jobs[4].data,
      );

      await replay.waitUntilFinished(events, 30000);

      expect(requests).toHaveLength(5);
      expect(handoffCounts).toEqual([5]);
      expect(
        await mastering.getJob(`assemble-${projectId}-ch-1`),
      ).toMatchObject({
        name: 'assemble-chapter',
        data: { projectId, chapterNumber: 1 },
      });
    }, 60000);

    it.each(['short', 'invalid', 'error'] as const)(
      'rejects %s output, cleans the file, and recovers on retry',
      async (mode) => {
        responseMode = mode;

        const data = {
          projectId,
          chapterNumber: 1,
          chunkId: 'ch_01_chunk_001',
        };
        const failed = await queue.add(PIPELINE_JOBS.synthesizeChunk, data);

        await expect(failed.waitUntilFinished(events, 30000)).rejects.toThrow();

        expect(
          (await stateManager.getState(projectId)).chapters['1'].chunks[0]
            .status,
        ).toBe('FAILED');
        await expect(
          fs.stat(
            stateManager.getArtifactPath(
              projectId,
              'chunks/ch_01_chunk_001.wav',
            ),
          ),
        ).rejects.toThrow();
        expect(handoffCounts).toEqual([]);

        responseMode = 'valid';

        const retry = await queue.add(PIPELINE_JOBS.synthesizeChunk, data);

        await retry.waitUntilFinished(events, 30000);

        expect(
          (await stateManager.getState(projectId)).chapters['1'].chunks[0],
        ).toMatchObject({ status: 'COMPLETED', durationMs: 500 });
      },
      60000,
    );

    it('hands off a finished chapter without waiting for other chapters', async () => {
      await stateManager.updateState(projectId, (current) => {
        current.chapters['2'] = {
          ...current.chapters['1'],
          chapterNumber: 2,
          scriptFilePath: 'chapters/ch_02_raw.txt',
          audioFilePath: 'chapters/ch_02_master.wav',
          chunks: [
            {
              ...current.chapters['1'].chunks[0],
              id: 'ch_02_chunk_001',
              filePath: 'chunks/ch_02_chunk_001.wav',
            },
          ],
        };
      });

      const state = await stateManager.getState(projectId);

      for (const chunk of state.chapters['1'].chunks) {
        const job = await queue.add(PIPELINE_JOBS.synthesizeChunk, {
          projectId,
          chapterNumber: 1,
          chunkId: chunk.id,
        });

        await job.waitUntilFinished(events, 30000);
      }

      expect(handoffCounts).toEqual([5]);
      expect((await stateManager.getState(projectId)).status).toBe(
        'SYNTHESIZING_AUDIO',
      );
    });

    it('retries a failed Redis handoff without synthesizing completed audio again', async () => {
      const state = await stateManager.getState(projectId);

      for (const chunk of state.chapters['1'].chunks.slice(0, 4)) {
        const job = await queue.add(PIPELINE_JOBS.synthesizeChunk, {
          projectId,
          chapterNumber: 1,
          chunkId: chunk.id,
        });

        await job.waitUntilFinished(events, 30000);
      }

      jest
        .spyOn(mastering, 'getJob')
        .mockRejectedValueOnce(new Error('Redis handoff unavailable'));

      const data = { projectId, chapterNumber: 1, chunkId: 'ch_01_chunk_005' };
      const failed = await queue.add(PIPELINE_JOBS.synthesizeChunk, data);

      await expect(failed.waitUntilFinished(events, 30000)).rejects.toThrow(
        'Redis handoff unavailable',
      );

      const retry = await queue.add(PIPELINE_JOBS.synthesizeChunk, data);

      await retry.waitUntilFinished(events, 30000);

      expect(requests).toHaveLength(5);
      expect(handoffCounts).toEqual([5]);
      expect((await stateManager.getState(projectId)).status).toBe('MASTERING');
    });

    it.each(['corrupt', 'missing'])(
      'regenerates a %s completed artifact instead of skipping it',
      async (mode) => {
        const path = stateManager.getArtifactPath(
          projectId,
          'chunks/ch_01_chunk_001.wav',
        );

        await fs.writeFile(path, 'corrupt');
        await stateManager.markChunkCompleted(
          projectId,
          1,
          'ch_01_chunk_001',
          500,
        );

        if (mode === 'missing') {
          await fs.unlink(path);
        }

        const job = await queue.add(PIPELINE_JOBS.synthesizeChunk, {
          projectId,
          chapterNumber: 1,
          chunkId: 'ch_01_chunk_001',
        });

        await job.waitUntilFinished(events, 30000);

        expect(requests).toHaveLength(1);
        expect(await module.get(AudioProbeService).getDurationMs(path)).toBe(
          500,
        );
      },
    );
  },
);
