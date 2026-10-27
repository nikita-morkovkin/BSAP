import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe';
import { MasterProjectQueueService } from '../../audio/master-project-queue.service';
import { ProjectMusicController } from '../../projects/project-music.controller';
import { PIPELINE_JOBS } from '../../queue/consts';
import { profileSchema } from '../../state/schemas';
import { StateManagerService } from '../../state/state-manager.service';
import { MusicProbeService } from '../music-probe.service';
import { MusicController } from '../music.controller';
import { MusicService } from '../music.service';
import { ProjectMusicService } from '../project-music.service';
import { MusicUploadStorage } from '../music-upload.storage';
import { z } from 'zod';
import { stateSchema } from '../../state/schemas';

describe('Music REST and project lifecycle', () => {
  let app: INestApplication<Server>;
  let root: string;
  let manager: StateManagerService;
  let id: string;
  const queued: { data: { projectId: string } }[] = [];
  const queue = {
    isPaused: jest.fn(() => Promise.resolve(false)),
    pause: jest.fn(),
    resume: jest.fn(),
    getJobs: jest.fn(() => Promise.resolve(queued)),
  };
  const master = { enqueueProject: jest.fn() };

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'bsap-music-api-'));
    queued.length = 0;

    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      imports: [
        MulterModule.register({
          storage: new MusicUploadStorage(
            new ConfigService({ AMBIENT_DIR: join(root, 'ambient') }),
          ),
          limits: { fileSize: 32, files: 1, fields: 1 },
        }),
      ],
      controllers: [MusicController, ProjectMusicController],
      providers: [
        MusicService,
        MusicProbeService,
        ProjectMusicService,
        StateManagerService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AMBIENT_DIR: join(root, 'ambient'),
            PROJECTS_DIR: join(root, 'projects'),
          }),
        },
        { provide: MasterProjectQueueService, useValue: master },
        ...[
          PIPELINE_JOBS.scriptQueue,
          PIPELINE_JOBS.textQueue,
          PIPELINE_JOBS.ttsQueue,
          PIPELINE_JOBS.audioMasteringQueue,
        ].map((name) => ({
          provide: getQueueToken(name),
          useValue: queue,
        })),
      ],
    }).compile();

    jest
      .spyOn(module.get(MusicProbeService), 'validate')
      .mockImplementation(async (path, format = 'wav') => {
        const content = await fs.readFile(path, 'utf8');

        if (content !== `valid ${format}`) {
          const { UnsupportedMediaTypeException } =
            await import('@nestjs/common');

          throw new UnsupportedMediaTypeException(
            'Invalid or truncated audio content',
          );
        }

        return { durationSeconds: 2, sizeBytes: content.length };
      });

    app = module.createNestApplication();

    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();

    manager = module.get(StateManagerService);

    const state = await manager.initProject(
      'Soundtrack test',
      profileSchema.parse({
        architectModel: 'architect',
        writerModel: 'writer',
        architectReasoningEffort: 'high',
        writerReasoningEffort: 'none',
        temperature: 0.7,
        architectSystemPrompt: 'Outline',
        writerSystemPrompt: 'Narrate',
        ttsVoice: 'bm_george',
        ttsSpeed: 0.85,
        masteringConfig: {},
      }),
    );

    id = state.projectId;
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns actionable status codes and cleans disk uploads after validation rejection', async () => {
    await request(app.getHttpServer()).post('/api/music').expect(400);
    await request(app.getHttpServer())
      .post('/api/music')
      .attach('file', Buffer.from('valid wav'), 'spoof.mp3')
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/music')
      .attach('file', Buffer.from('not mp3'), 'invalid.mp3')
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/music')
      .attach('file', Buffer.from('valid wav'), 'unsupported.ogg')
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/music')
      .attach('file', Buffer.from('not wav'), 'spoof.wav')
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/music')
      .attach('file', Buffer.alloc(33), 'large.wav')
      .expect(413);
    await request(app.getHttpServer())
      .post('/api/music')
      .field('displayName', ' ')
      .attach('file', Buffer.from('valid wav'), 'name.wav')
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/music/not-an-id')
      .send({ displayName: 'x' })
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/music/00000000-0000-4000-8000-000000000000')
      .expect(404);

    expect(await fs.readdir(join(root, 'ambient', '.uploads'))).toEqual([]);
    expect((await app.get(MusicService).list()).tracks).toEqual([]);
  });

  it('supports multipart CRUD with immutable versions and validated metadata', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/music')
      .field('displayName', 'Rain')
      .attach('file', Buffer.from('valid wav'), 'rain.wav')
      .expect(201);

    const uploadedTrack = z
      .object({
        id: z.uuid(),
        version: z.uuid(),
        filePath: z.never().optional(),
      })
      .parse(uploaded.body);
    const trackId = uploadedTrack.id;

    expect(uploadedTrack.filePath).toBeUndefined();

    await request(app.getHttpServer())
      .patch(`/api/music/${trackId}`)
      .send({ displayName: '' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/music/${trackId}`)
      .send({ displayName: 'Quiet rain' })
      .expect(200);

    const replacement = await request(app.getHttpServer())
      .put(`/api/music/${trackId}/file`)
      .attach('file', Buffer.from('valid wav'), 'new.wav')
      .expect(200);

    const replacedTrack = z
      .object({ id: z.uuid(), version: z.uuid() })
      .parse(replacement.body);

    expect(replacedTrack.id).toBe(trackId);
    expect(replacedTrack.version).not.toBe(uploadedTrack.version);

    await request(app.getHttpServer())
      .delete(`/api/music/${trackId}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/music')
      .expect(200)
      .expect(({ body }) => {
        expect(
          z.object({ tracks: z.array(z.unknown()) }).parse(body).tracks,
        ).toEqual([]);
      });
  });

  it('uploads MP3s and preserves their snapshots across cross-format replacement and deletion', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/music')
      .attach('file', Buffer.from('valid mp3'), 'rain.MP3')
      .expect(201);
    const track = z
      .object({ id: z.uuid(), version: z.uuid(), originalFilename: z.string() })
      .parse(uploaded.body);

    expect(track.originalFilename).toBe('rain.MP3');

    const saved = await app.get(ProjectMusicService).initialize(id, [track.id]);
    const snapshot = saved.music!.snapshots[0];

    expect(snapshot.filePath).toMatch(/\.mp3$/);
    expect(
      await fs.readFile(manager.getArtifactPath(id, snapshot.filePath), 'utf8'),
    ).toBe('valid mp3');

    await request(app.getHttpServer())
      .put(`/api/music/${track.id}/file`)
      .attach('file', Buffer.from('valid wav'), 'replacement.wav')
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/music/${track.id}`)
      .expect(204);

    const retained = await app
      .get(MusicService)
      .snapshot(manager.getProjectDirectory(id), [track.id], 1, saved.music);

    expect(retained.snapshots[0].version).toBe(track.version);
    expect(retained.snapshots[0].filePath).toMatch(/\.mp3$/);
    expect(
      await fs.readFile(
        manager.getArtifactPath(id, retained.snapshots[0].filePath),
        'utf8',
      ),
    ).toBe('valid mp3');
  });

  it('saves empty selections, rejects stale writes, invalidates only derived output, and no-ops unchanged selections', async () => {
    await fs.writeFile(
      manager.getArtifactPath(id, 'output/voice_raw_full.wav'),
      'narration',
    );

    const response = await request(app.getHttpServer())
      .put(`/api/projects/${id}/music`)
      .send({ revision: 0, selectedTrackIds: [] })
      .expect(200);

    const savedState = stateSchema.parse(response.body);

    expect(savedState.music).toMatchObject({
      revision: 1,
      selectedTrackIds: [],
      snapshots: [],
    });
    expect(savedState.mixNeedsRebuild).toBe(true);
    expect(savedState.outputFiles).toEqual({});
    expect(
      await fs.readFile(
        manager.getArtifactPath(id, 'output/voice_raw_full.wav'),
        'utf8',
      ),
    ).toBe('narration');

    await request(app.getHttpServer())
      .put(`/api/projects/${id}/music`)
      .send({ revision: 0, selectedTrackIds: [] })
      .expect(409);

    const unchanged = await request(app.getHttpServer())
      .put(`/api/projects/${id}/music`)
      .send({ revision: 1, selectedTrackIds: [] })
      .expect(200);

    expect(stateSchema.parse(unchanged.body).updatedAt).toBe(
      savedState.updatedAt,
    );
  });

  it('saves a new music level without replacing saved snapshots or assembled narration', async () => {
    const initial = await app.get(ProjectMusicService).initialize(id, []);
    const voiceoverPath = manager.getArtifactPath(
      id,
      'output/voice_raw_full.wav',
    );

    await fs.writeFile(voiceoverPath, 'assembled narration');
    await manager.updateState(id, (current) => {
      current.outputFiles = {
        narration: 'output/voice_raw_full.wav',
        wav: 'output/master_final.wav',
      };
    });

    const response = await request(app.getHttpServer())
      .put(`/api/projects/${id}/music`)
      .send({
        revision: initial.music!.revision,
        selectedTrackIds: [],
        ambientVolumeDb: -18,
      })
      .expect(200);
    const saved = stateSchema.parse(response.body);

    expect(saved.music).toMatchObject({
      revision: 1,
      selectedTrackIds: [],
      snapshots: [],
    });
    expect(saved.profile.masteringConfig.ambientVolumeDb).toBe(-18);
    expect(saved.mixNeedsRebuild).toBe(true);
    expect(saved.outputFiles).toEqual({
      narration: 'output/voice_raw_full.wav',
    });
    expect(await fs.readFile(voiceoverPath, 'utf8')).toBe(
      'assembled narration',
    );
  });

  it('rejects music levels outside the supported range', async () => {
    await request(app.getHttpServer())
      .put(`/api/projects/${id}/music`)
      .send({ revision: 0, selectedTrackIds: [], ambientVolumeDb: 1 })
      .expect(400);
  });

  it('rejects queued and active production conflicts before snapshot creation', async () => {
    queued.push({ data: { projectId: id } });

    await request(app.getHttpServer())
      .put(`/api/projects/${id}/music`)
      .send({ revision: 0, selectedTrackIds: [] })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/projects/${id}/remaster`)
      .expect(409);

    queued.length = 0;

    await manager.updateState(id, (state) => {
      state.status = 'SYNTHESIZING_AUDIO';
    });
    await request(app.getHttpServer())
      .put(`/api/projects/${id}/music`)
      .send({ revision: 0, selectedTrackIds: [] })
      .expect(409);

    expect((await manager.getState(id)).music).toBeUndefined();
    expect(queue.resume).toHaveBeenCalled();
  });

  it('deleting a project removes only its snapshots and leaves the global library usable', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/music')
      .attach('file', Buffer.from('valid wav'), 'shared.wav')
      .expect(201);
    const track = z.object({ id: z.uuid() }).parse(uploaded.body);

    await app.get(ProjectMusicService).initialize(id, [track.id]);

    const directory = manager.getProjectDirectory(id);

    await manager.deleteProject(id);

    await expect(fs.stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });

    const catalog = await app.get(MusicService).list();

    expect(catalog.tracks[0].id).toBe(track.id);
    expect(catalog.tracks[0].available).toBe(true);
  });

  it('remasters using assembled narration only and keeps completed legacy projects readable without migration on GET', async () => {
    await manager.updateState(id, (state) => {
      state.status = 'COMPLETED';
      state.chapters['1'] = {
        chapterNumber: 1,
        title: 'Quiet',
        scriptStatus: 'COMPLETED',
        ttsStatus: 'COMPLETED',
        scriptFilePath: 'chapters/ch_01_raw.txt',
        audioFilePath: 'chapters/ch_01_master.wav',
        durationMs: 1000,
        chunks: [],
      };
    });
    await fs.writeFile(
      manager.getArtifactPath(id, 'chapters/ch_01_master.wav'),
      'narration',
    );

    expect((await manager.getState(id)).music).toBeUndefined();

    await request(app.getHttpServer())
      .post(`/api/projects/${id}/remaster`)
      .expect(202);

    expect(master.enqueueProject).toHaveBeenCalledWith(id);
    expect((await manager.getState(id)).music?.selectedTrackIds).toEqual([]);
    expect((await manager.getState(id)).status).toBe('MASTERING');
  });
});
