import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue, QueueEvents } from 'bullmq';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PIPELINE_JOBS } from '../../queue/consts/pipeline-jobs.const';
import { profileSchema } from '../../state/schemas/profile.schema';
import { StateManagerService } from '../../state/state-manager.service';
import { AudioModule } from '../audio.module';
import { FfmpegService } from '../ffmpeg.service';
import type { AudioJob } from '../types';

(process.env.BSAP_AUDIO_INTEGRATION === '1' ? describe : describe.skip)(
  'Audio integration: real FFmpeg, ffprobe and BullMQ',
  () => {
    let module: TestingModule;
    let directory: string;
    let stateManager: StateManagerService;
    let engine: FfmpegService;
    let queue: Queue<AudioJob>;
    let events: QueueEvents;
    let projectId: string;

    beforeAll(async () => {
      const { execa } = await import('execa');

      directory = await fs.mkdtemp(join(tmpdir(), "bsap-audio-'quoted'-"));

      const ambient = join(directory, 'ambient');

      await fs.mkdir(ambient);

      for (const frequency of [80, 100]) {
        await execa(process.env.FFMPEG_PATH ?? 'ffmpeg', [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=${frequency}:duration=2`,
          join(ambient, `${frequency}.wav`),
        ]);
      }

      const prefix = `bsap-audio-${process.pid}-${Date.now()}`;
      const connection = {
        host: process.env.TEST_REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.TEST_REDIS_PORT ?? 6379),
      };

      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            load: [() => ({ PROJECTS_DIR: directory, AMBIENT_DIR: ambient })],
          }),
          BullModule.forRoot({ connection, prefix }),
          AudioModule,
        ],
      }).compile();

      await module.init();

      stateManager = module.get(StateManagerService);
      engine = module.get(FfmpegService);
      queue = module.get(getQueueToken(PIPELINE_JOBS.audioMasteringQueue));
      events = new QueueEvents(PIPELINE_JOBS.audioMasteringQueue, {
        connection,
        prefix,
      });

      await events.waitUntilReady();

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
          ttsVoice: 'bm_george',
          ttsSpeed: 0.85,
          masteringConfig: {},
        }),
      );

      projectId = state.projectId;

      for (const number of [1, 2]) {
        for (const index of [0, 1, 2]) {
          await execa(process.env.FFMPEG_PATH ?? 'ffmpeg', [
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=220:duration=0.5',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-c:a',
            'pcm_s24le',
            stateManager.getArtifactPath(
              projectId,
              `chunks/ch_${number}_${index}.wav`,
            ),
          ]);
        }
      }

      await stateManager.updateState(projectId, (current) => {
        current.outlineCompleted = true;

        for (const number of [1, 2]) {
          current.chapters[String(number)] = {
            chapterNumber: number,
            title: number === 1 ? 'Stars, "softly"' : 'Quiet galaxies',
            scriptStatus: 'COMPLETED',
            ttsStatus: 'PROCESSING',
            scriptFilePath: `chapters/ch_0${number}_raw.txt`,
            audioFilePath: `chapters/ch_0${number}_master.wav`,
            durationMs: 0,
            chunks: [2, 0, 1].map((index) => ({
              id: `ch_${number}_${index}`,
              index,
              text: 'Quiet stars.',
              pauseAfterMs: index === 1 ? 2000 : 600,
              status: 'COMPLETED',
              filePath: `chunks/ch_${number}_${index}.wav`,
              durationMs: 500,
            })),
          };
        }
      });
    }, 60000);

    afterAll(async () => {
      if (queue) {
        await queue.obliterate({ force: true });
      }

      await events?.close();
      await module?.close();

      if (directory) {
        await fs.rm(directory, { recursive: true, force: true });
      }
    });

    it('assembles two chapters and automatically masters, exports and completes the project', async () => {
      const first = await queue.add(PIPELINE_JOBS.assembleChapter, {
        projectId,
        chapterNumber: 1,
      });

      await first.waitUntilFinished(events, 60000);

      expect(await queue.getJob(`master-${projectId}`)).toBeUndefined();

      const cachedPath = stateManager.getArtifactPath(
        projectId,
        'chunks/silence/silence_600.wav',
      );
      const cached = await fs.stat(cachedPath);
      const second = await queue.add(PIPELINE_JOBS.assembleChapter, {
        projectId,
        chapterNumber: 2,
      });

      await second.waitUntilFinished(events, 60000);

      const master = await queue.getJob(`master-${projectId}`);

      expect(master).toBeDefined();

      await master!.waitUntilFinished(events, 120000);

      const completed = await stateManager.getState(projectId);

      expect(completed.status).toBe('COMPLETED');
      expect(completed.error).toBeUndefined();
      expect(completed.chapters['1'].durationMs).toBe(4700);
      expect(completed.chapters['2'].durationMs).toBe(4700);
      expect((await fs.stat(cachedPath)).mtimeMs).toBe(cached.mtimeMs);
      expect(await engine.getDurationSeconds(cachedPath)).toBeCloseTo(0.6, 5);

      for (const path of [
        'chapters/ch_01_master.wav',
        'chapters/ch_02_master.wav',
        'output/voice_raw_full.wav',
        'output/ambient_cycle.wav',
        'output/background_music.wav',
        'output/master_final.wav',
        'output/master_final.flac',
      ]) {
        expect(
          await engine.getDurationSeconds(
            stateManager.getArtifactPath(projectId, path),
          ),
        ).toBeGreaterThan(0);
      }

      const wav = stateManager.getArtifactPath(
        projectId,
        'output/master_final.wav',
      );
      const flac = stateManager.getArtifactPath(
        projectId,
        'output/master_final.flac',
      );
      const { execa } = await import('execa');
      const probe = await execa(process.env.FFPROBE_PATH ?? 'ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=sample_rate,channels,codec_name',
        '-of',
        'csv=p=0',
        wav,
      ]);

      expect(probe.stdout).toBe('pcm_s16le,44100,2');
      expect(await engine.getDurationSeconds(wav)).toBeCloseTo(24.4, 2);
      expect(await engine.getDurationSeconds(flac)).toBeCloseTo(24.4, 2);
      expect(
        await engine.getDurationSeconds(
          stateManager.getArtifactPath(
            projectId,
            'output/background_music.wav',
          ),
        ),
      ).toBeCloseTo(24.4, 2);

      const timestamps = await fs.readFile(
        stateManager.getArtifactPath(
          projectId,
          'output/youtube_timestamps.txt',
        ),
        'utf8',
      );
      const markers = await fs.readFile(
        stateManager.getArtifactPath(projectId, 'output/timeline_markers.csv'),
        'utf8',
      );
      const concat = await fs.readFile(
        stateManager.getArtifactPath(projectId, 'chapters/ch_01_concat.txt'),
        'utf8',
      );

      expect(timestamps).toBe(
        '00:00:00 - Stars, "softly"\n00:00:04 - Quiet galaxies\n',
      );
      expect(markers).toContain(
        '#,Timecode In,Timecode Out,Name,Comment,Color',
      );
      expect(markers).toContain('"00:00:04:21"');
      expect(markers).toContain('"Stars, ""softly"""');
      expect(concat.indexOf('ch_1_0.wav')).toBeLessThan(
        concat.indexOf('ch_1_1.wav'),
      );
      expect(concat).toContain("file '../chunks/silence/silence_2000.wav'");
    }, 180000);

    it('rejects unfinished chapters and persists queue failures without claiming completion', async () => {
      await stateManager.updateState(projectId, (state) => {
        state.chapters['1'].chunks[0].status = 'PENDING';
      });

      const job = await queue.add(PIPELINE_JOBS.assembleChapter, {
        projectId,
        chapterNumber: 1,
      });

      await expect(job.waitUntilFinished(events, 30000)).rejects.toThrow(
        'completed chunks',
      );

      const state = await stateManager.getState(projectId);

      expect(state.status).toBe('FAILED');
      expect(state.error).toContain('completed chunks');
    }, 30000);

    it('recovers a failed master job after ambient assets are restored', async () => {
      await stateManager.updateState(projectId, (state) => {
        state.chapters['1'].chunks[0].status = 'COMPLETED';
      });
      await fs.rename(
        join(directory, 'ambient'),
        join(directory, 'ambient-backup'),
      );

      const job = await queue.add(PIPELINE_JOBS.masterProject, { projectId });

      try {
        await expect(job.waitUntilFinished(events, 30000)).rejects.toThrow();

        const failed = await stateManager.getState(projectId);

        expect(failed.status).toBe('FAILED');
        expect(failed.outputFiles).toEqual({});
      } finally {
        await fs.rename(
          join(directory, 'ambient-backup'),
          join(directory, 'ambient'),
        );
      }

      await job.retry();
      await job.waitUntilFinished(events, 120000);

      const recovered = await stateManager.getState(projectId);

      expect(recovered.status).toBe('COMPLETED');
      expect(recovered.error).toBeUndefined();
      expect(recovered.outputFiles.flac).toBe('output/master_final.flac');
      expect(recovered.outputFiles.backgroundMusic).toBe(
        'output/background_music.wav',
      );
    }, 180000);
  },
);
