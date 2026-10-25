import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import request from 'supertest';
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe';
import { MasterProjectQueueService } from '../../audio/master-project-queue.service';
import { PromptService } from '../../llm/prompt.service';
import { ScriptQueueService } from '../../llm/script-queue.service';
import { profileSchema } from '../../state/schemas';
import { StateManagerService } from '../../state/state-manager.service';
import type { Profile, State } from '../../state/types';
import { TtsQueueService } from '../../text/tts-queue.service';
import { ChapterAssemblyQueueService } from '../../tts/chapter-assembly-queue.service';
import { MediaController } from '../media.controller';
import { MediaService } from '../media.service';
import { ProjectsController } from '../projects.controller';
import { ProjectsService } from '../projects.service';

describe('Projects REST API', () => {
  let app: INestApplication<Server>;
  let directory: string;
  let manager: StateManagerService;
  let profile: Profile;
  let state: State;
  const scripts = {
    enqueueProject: jest.fn(),
    enqueueNormalization: jest.fn(),
  };
  const tts = { enqueueChunk: jest.fn() };
  const assembly = { enqueueChapter: jest.fn() };
  const mastering = { enqueueProject: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-api-'));

    const module = await Test.createTestingModule({
      controllers: [ProjectsController, MediaController],
      providers: [
        ProjectsService,
        MediaService,
        StateManagerService,
        PromptService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            PROJECTS_DIR: directory,
            PROMPTS_DIR: resolve(__dirname, '../../../../../prompts'),
          }),
        },
        { provide: ScriptQueueService, useValue: scripts },
        { provide: TtsQueueService, useValue: tts },
        { provide: ChapterAssemblyQueueService, useValue: assembly },
        { provide: MasterProjectQueueService, useValue: mastering },
      ],
    }).compile();

    app = module.createNestApplication();

    app.useGlobalPipes(new ZodValidationPipe());
    app.enableCors({
      exposedHeaders: ['Content-Disposition', 'Content-Range', 'Accept-Ranges'],
    });

    await app.init();

    manager = module.get(StateManagerService);
    profile = await module.get(ProjectsService).getDefaults();
    state = await manager.initProject('Quiet Stars', profile);
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('returns valid defaults and the on-disk system prompts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/projects/defaults')
      .expect(200);
    const defaults = profileSchema.parse(response.body);

    expect(defaults.maxChunkChars).toBe(200);
    expect(defaults.architectSystemPrompt).toBe(
      (
        await fs.readFile(
          resolve(__dirname, '../../../../../prompts/architect.system.md'),
          'utf8',
        )
      ).trim(),
    );
    expect(defaults.writerSystemPrompt).toBe(
      (
        await fs.readFile(
          resolve(__dirname, '../../../../../prompts/writer.system.md'),
          'utf8',
        )
      ).trim(),
    );
  });

  it('validates creation payloads and enqueues the outline pipeline', async () => {
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ topic: 'Ocean', profile: { ...profile, ttsSpeed: 0 } })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ topic: 'Ocean', profile, extra: true })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({ topic: 'Ocean', profile })
      .expect(201);

    expect(scripts.enqueueProject).toHaveBeenCalledWith('002-ocean');
  });

  it('lists summaries newest first and returns state with a nullable outline', async () => {
    await manager.updateState(state.projectId, (current) => {
      current.createdAt = '2020-01-01T00:00:00.000Z';
    });

    const newer = await manager.initProject('Ocean', profile);
    const response = await request(app.getHttpServer())
      .get('/api/projects')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ projectId: newer.projectId }),
      expect.objectContaining({ projectId: state.projectId }),
    ]);
    const summaries: unknown = response.body;

    if (!Array.isArray(summaries)) {
      throw new Error('Expected project summaries');
    }

    expect(summaries[0]).not.toHaveProperty('profile');

    const detail = await request(app.getHttpServer())
      .get(`/api/projects/${state.projectId}`)
      .expect(200);

    expect(detail.body).toEqual({
      state: await manager.getState(state.projectId),
      outline: null,
    });

    const outline = {
      topic: state.topic,
      totalChapters: 1,
      chapters: [
        {
          chapterNumber: 1,
          title: 'Stars',
          keyScientificFacts: ['Light travels.'],
          sensoryThemes: ['Warmth'],
          targetWordCount: 1000,
        },
      ],
    };

    await fs.writeFile(
      manager.getArtifactPath(state.projectId, 'outline.json'),
      JSON.stringify(outline),
    );

    const ready = await request(app.getHttpServer())
      .get(`/api/projects/${state.projectId}`)
      .expect(200);

    expect(ready.body).toEqual(expect.objectContaining({ outline }));
  });

  it('returns 400 for invalid paths and 404 for unknown resources', async () => {
    await request(app.getHttpServer())
      .get('/api/projects/not-a-project')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/projects/999-missing')
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/projects/${state.projectId}/media/download/invalid`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/projects/${state.projectId}/media/download/flac`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/projects/${state.projectId}/media/chapters/0/download`)
      .expect(400);
  });

  describe('with completed media', () => {
    beforeEach(async () => {
      await fs.writeFile(
        manager.getArtifactPath(state.projectId, 'chunks/ch_01_chunk_001.wav'),
        '0123456789',
      );
      await fs.writeFile(
        manager.getArtifactPath(state.projectId, 'chapters/ch_01_master.wav'),
        'chapter-wav',
      );

      state = await manager.updateState(state.projectId, (current) => {
        current.outlineCompleted = true;
        current.status = 'COMPLETED';
        current.chapters['1'] = {
          chapterNumber: 1,
          title: 'Stars',
          scriptStatus: 'COMPLETED',
          ttsStatus: 'COMPLETED',
          scriptFilePath: 'chapters/ch_01_raw.txt',
          audioFilePath: 'chapters/ch_01_master.wav',
          durationMs: 1000,
          chunks: [
            {
              id: 'ch_01_chunk_001',
              index: 0,
              text: 'Stars shine softly.',
              pauseAfterMs: 500,
              status: 'COMPLETED',
              filePath: 'chunks/ch_01_chunk_001.wav',
              durationMs: 1000,
            },
          ],
        };
        current.outputFiles = {
          wav: 'output/master_final.wav',
          flac: 'output/master_final.flac',
          timestamps: 'output/youtube_timestamps.txt',
          markers: 'output/timeline_markers.csv',
        };
      });

      await fs.writeFile(
        manager.getArtifactPath(state.projectId, 'chapters/ch_01_raw.txt'),
        'Stars shine softly.',
      );

      for (const path of Object.values(state.outputFiles)) {
        await fs.writeFile(
          manager.getArtifactPath(state.projectId, path),
          'fixture-content',
        );
      }
    });

    it.each([
      ['wav', 'master_final.wav', 'audio/wav'],
      ['flac', 'master_final.flac', 'audio/flac'],
      ['timestamps', 'youtube_timestamps.txt', 'text/plain'],
      ['markers', 'timeline_markers.csv', 'text/csv'],
    ])(
      'streams the %s artifact as an attachment',
      async (artifact, filename, type) => {
        const response = await request(app.getHttpServer())
          .get(`/api/projects/${state.projectId}/media/download/${artifact}`)
          .expect(200);

        expect(response.headers['content-disposition']).toBe(
          `attachment; filename="${filename}"`,
        );
        expect(response.headers['content-type']).toContain(type);
        expect(response.headers['content-length']).toBe('15');
        expect(
          Buffer.isBuffer(response.body)
            ? response.body.toString()
            : response.text,
        ).toBe('fixture-content');
      },
    );

    it('streams the chapter with the UI download filename', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/projects/${state.projectId}/media/chapters/1/download`)
        .expect(200);

      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="ch_01.wav"',
      );
      expect(response.body).toEqual(Buffer.from('chapter-wav'));
    });

    it('rejects media paths that escape through a directory symlink', async () => {
      const outside = join(directory, 'outside');
      const link = manager.getArtifactPath(state.projectId, 'linked');

      await fs.mkdir(outside);
      await fs.writeFile(join(outside, 'private.flac'), 'private');
      await fs.symlink(
        outside,
        link,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      await manager.updateState(state.projectId, (current) => {
        current.outputFiles.flac = 'linked/private.flac';
      });
      await request(app.getHttpServer())
        .get(`/api/projects/${state.projectId}/media/download/flac`)
        .expect(404);
    });

    it('does not requeue a fully completed project', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${state.projectId}/resume`)
        .expect(202);

      expect(scripts.enqueueProject).not.toHaveBeenCalled();
      expect(scripts.enqueueNormalization).not.toHaveBeenCalled();
      expect(tts.enqueueChunk).not.toHaveBeenCalled();
      expect(assembly.enqueueChapter).not.toHaveBeenCalled();
      expect(mastering.enqueueProject).not.toHaveBeenCalled();
    });

    it.each([
      ['bytes=2-5', '2345', 'bytes 2-5/10'],
      ['bytes=7-', '789', 'bytes 7-9/10'],
      ['bytes=-3', '789', 'bytes 7-9/10'],
      ['bytes=8-100', '89', 'bytes 8-9/10'],
    ])(
      'streams %s with 206 and precise range headers',
      async (range, content, contentRange) => {
        const response = await request(app.getHttpServer())
          .get(`/api/projects/${state.projectId}/media/chunks/ch_01_chunk_001`)
          .set('Range', range)
          .expect(206);

        expect(response.headers['accept-ranges']).toBe('bytes');
        expect(response.headers['content-range']).toBe(contentRange);
        expect(response.body).toEqual(Buffer.from(content));
      },
    );

    it.each(['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'invalid'])(
      'rejects unsatisfiable or unsupported range %s',
      async (range) => {
        const response = await request(app.getHttpServer())
          .get(`/api/projects/${state.projectId}/media/chunks/ch_01_chunk_001`)
          .set('Range', range)
          .expect(416);

        expect(response.headers['content-range']).toBe('bytes */10');
      },
    );

    it('streams the full chunk and reports deleted files as missing', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/projects/${state.projectId}/media/chunks/ch_01_chunk_001`)
        .expect(200);

      expect(response.body).toEqual(Buffer.from('0123456789'));

      await fs.rm(
        manager.getArtifactPath(state.projectId, state.outputFiles.flac!),
      );
      await request(app.getHttpServer())
        .get(`/api/projects/${state.projectId}/media/download/flac`)
        .expect(404);
    });

    it('regenerates only the selected chunk and persists overrides without changing the profile', async () => {
      const overrides = {
        text: 'A quiet star.',
        ttsVoice: 'bm_lewis',
        ttsSpeed: 0.9,
        pauseAfterMs: 800,
      };

      await request(app.getHttpServer())
        .post(
          `/api/projects/${state.projectId}/chapters/1/chunks/ch_01_chunk_001/regenerate`,
        )
        .send(overrides)
        .expect(202);

      const updated = await manager.getState(state.projectId);

      expect(updated.chapters['1'].chunks[0]).toMatchObject({
        ...overrides,
        status: 'PENDING',
        durationMs: 0,
      });
      expect(updated.profile).toEqual(profile);
      expect(updated.outputFiles).toEqual({});
      expect(updated.chapters['1'].ttsStatus).toBe('PENDING');
      expect(tts.enqueueChunk).toHaveBeenCalledTimes(1);
      expect(tts.enqueueChunk).toHaveBeenCalledWith({
        projectId: state.projectId,
        chapterNumber: 1,
        chunkId: 'ch_01_chunk_001',
      });
      expect(assembly.enqueueChapter).not.toHaveBeenCalled();
      expect(mastering.enqueueProject).not.toHaveBeenCalled();
    });

    it('rejects invalid regeneration overrides, unknown chunks, and concurrent regeneration', async () => {
      const url = `/api/projects/${state.projectId}/chapters/1/chunks/ch_01_chunk_001/regenerate`;

      await request(app.getHttpServer())
        .post(url)
        .send({ ttsSpeed: 9 })
        .expect(400);
      await request(app.getHttpServer())
        .post(url.replace('ch_01_chunk_001', 'missing'))
        .send({})
        .expect(404);
      await request(app.getHttpServer()).post(url).send({}).expect(202);
      await request(app.getHttpServer()).post(url).send({}).expect(409);
    });

    it('resumes missing chunks, assembled chapters, and final artifacts at the correct stage', async () => {
      await fs.rm(
        manager.getArtifactPath(state.projectId, 'chunks/ch_01_chunk_001.wav'),
      );
      await request(app.getHttpServer())
        .post(`/api/projects/${state.projectId}/resume`)
        .expect(202);

      expect(tts.enqueueChunk).toHaveBeenCalledTimes(1);
      expect(mastering.enqueueProject).not.toHaveBeenCalled();

      await fs.writeFile(
        manager.getArtifactPath(state.projectId, 'chunks/ch_01_chunk_001.wav'),
        '0123456789',
      );
      await fs.rm(
        manager.getArtifactPath(state.projectId, 'chapters/ch_01_master.wav'),
      );
      await request(app.getHttpServer())
        .post(`/api/projects/${state.projectId}/resume`)
        .expect(202);

      expect(assembly.enqueueChapter).toHaveBeenCalledWith({
        projectId: state.projectId,
        chapterNumber: 1,
      });

      await fs.writeFile(
        manager.getArtifactPath(state.projectId, 'chapters/ch_01_master.wav'),
        'chapter',
      );
      await fs.rm(
        manager.getArtifactPath(state.projectId, state.outputFiles.flac!),
      );
      await request(app.getHttpServer())
        .post(`/api/projects/${state.projectId}/resume`)
        .expect(202);

      expect(mastering.enqueueProject).toHaveBeenCalledWith(state.projectId);
    });
  });

  it('resumes outline/script generation and normalization', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${state.projectId}/resume`)
      .expect(202);

    expect(scripts.enqueueProject).toHaveBeenCalledWith(state.projectId);

    await manager.updateState(state.projectId, (current) => {
      current.outlineCompleted = true;
      current.chapters['1'] = {
        chapterNumber: 1,
        title: 'Stars',
        scriptStatus: 'COMPLETED',
        ttsStatus: 'PENDING',
        scriptFilePath: 'chapters/ch_01_raw.txt',
        audioFilePath: 'chapters/ch_01_master.wav',
        durationMs: 0,
        chunks: [],
      };
    });
    await fs.writeFile(
      manager.getArtifactPath(state.projectId, 'chapters/ch_01_raw.txt'),
      'Stars.',
    );
    await request(app.getHttpServer())
      .post(`/api/projects/${state.projectId}/resume`)
      .expect(202);

    expect(scripts.enqueueNormalization).toHaveBeenCalledWith(state.projectId);
  });
});
