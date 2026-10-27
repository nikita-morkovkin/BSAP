import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe';
import { FfmpegService } from '../../audio/ffmpeg.service';
import { StateManagerService } from '../../state/state-manager.service';
import { profileSchema } from '../../state/schemas';
import { VideoController } from '../video.controller';
import { VideoJobService } from '../video-job.service';
import { VideoLibraryService } from '../video-library.service';
import { VideoPreviewService } from '../video-preview.service';
import { VideoUploadInterceptor } from '../video-upload.interceptor';
import { videoStyleSchema } from '../schemas';

describe('Video project API and durable jobs', () => {
  let app: INestApplication<Server>;
  let directory: string;
  let id: string;
  let state: StateManagerService;
  let jobs: VideoJobService;
  const queue = {
    add: jest.fn().mockResolvedValue({}),
    getJob: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-video-api-'));

    const module = await Test.createTestingModule({
      controllers: [VideoController],
      providers: [
        StateManagerService,
        VideoJobService,
        VideoLibraryService,
        VideoPreviewService,
        VideoUploadInterceptor,
        {
          provide: ConfigService,
          useValue: new ConfigService({ PROJECTS_DIR: directory }),
        },
        { provide: getQueueToken('video'), useValue: queue },
        {
          provide: FfmpegService,
          useValue: { getFinalAudioInfo: () => Promise.resolve(null) },
        },
      ],
    }).compile();

    app = module.createNestApplication();

    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();

    state = module.get(StateManagerService);
    jobs = module.get(VideoJobService);

    const project = await state.initProject(
      'Video API',
      profileSchema.parse({
        architectModel: 'test',
        writerModel: 'test',
        architectSystemPrompt: 'test',
        writerSystemPrompt: 'test',
        architectReasoningEffort: 'none',
        writerReasoningEffort: 'none',
        temperature: 0.7,
        ttsVoice: 'bm_george',
        ttsSpeed: 1,
        masteringConfig: {},
      }),
    );

    id = project.projectId;
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('persists validated settings and rejects raw filter expressions', async () => {
    const path = `/api/projects/${id}/video/settings`;
    const style = videoStyleSchema.parse({ brightness: -0.3 });

    await request(app.getHttpServer()).put(path).send(style).expect(200);

    const response = await request(app.getHttpServer()).get(path).expect(200);

    expect(response.body).toEqual(style);

    await request(app.getHttpServer())
      .put(path)
      .send({ ...style, vignetteAngle: 'PI/4;movie=x' })
      .expect(400);
  });

  it('queues independently of audio, rejects concurrent work, and cancels durably', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/projects/${id}/video/build`)
      .send({})
      .expect(201);
    const payload: unknown = response.body;

    if (
      !payload ||
      typeof payload !== 'object' ||
      !('jobId' in payload) ||
      typeof payload.jobId !== 'string'
    ) {
      throw new Error('Expected a video job response');
    }

    const job = await jobs.get(id, payload.jobId);

    expect(job.stage).toBe('queued');
    expect(queue.add).toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(`/api/projects/${id}/video/build`)
      .send({})
      .expect(409);

    const signal = jobs.attach(job.jobId);

    await jobs.cancel(id, job.jobId);

    expect(signal.aborted).toBe(true);

    await jobs.update(id, job.jobId, { stage: 'done' });

    expect((await jobs.get(id, job.jobId)).stage).toBe('cancelled');

    jobs.detach(job.jobId);
  });

  it('marks interrupted work failed after restart and scopes job access to a project', async () => {
    const job = await jobs.start(id, 'build');

    await jobs.update(id, job.jobId, { stage: 'rendering_chunks' });
    await jobs.onModuleInit();

    expect((await jobs.get(id, job.jobId)).stage).toBe('failed');

    await request(app.getHttpServer())
      .get(`/api/projects/${id}/video/jobs/other`)
      .expect(404);
  });

  it('returns per-file validation errors rather than failing the batch', async () => {
    const result = await request(app.getHttpServer())
      .post(`/api/projects/${id}/video/clips`)
      .attach('files', Buffer.from('not video'), 'invalid.txt')
      .expect(201);

    const payload: unknown = result.body;

    expect(payload).toEqual([
      { name: 'invalid.txt', error: 'Unsupported video extension' },
    ]);
    expect(await state.getState(id)).toBeDefined();
  });

  it('streams only the requested byte range from project-owned video output', async () => {
    const path = state.getArtifactPath(id, 'video/final/test.mp4');

    await fs.mkdir(state.getArtifactPath(id, 'video/final'), {
      recursive: true,
    });
    await fs.writeFile(path, Buffer.alloc(100, 1));
    await state.updateState(id, (current) => {
      current.video = {
        style: videoStyleSchema.parse({}),
        output: 'video/final/test.mp4',
      };
    });

    await request(app.getHttpServer())
      .get(`/api/projects/${id}/video/output`)
      .set('Range', 'bytes=10-19')
      .expect(206)
      .expect('Content-Range', 'bytes 10-19/100')
      .expect('Content-Length', '10');
  });
});
