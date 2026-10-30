import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe';
import { StateManagerService } from '../../state/state-manager.service';
import { profileSchema } from '../../state/schemas';
import { FfmpegService } from '../../audio/ffmpeg.service';
import { ExportController } from '../export.controller';
import { ExportService } from '../export.service';
import { VideoJobService } from '../video-job.service';
import { VideoInputsService } from '../video-inputs.service';
import { videoStyleSchema } from '../schemas';

describe('Export registry and streaming API', () => {
  let app: INestApplication<Server>;
  let state: StateManagerService;
  let directory: string;
  let id: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-exports-'));

    const module = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        StateManagerService,
        ExportService,
        {
          provide: ConfigService,
          useValue: new ConfigService({ PROJECTS_DIR: directory }),
        },
        {
          provide: VideoJobService,
          useValue: { start: jest.fn().mockResolvedValue({ jobId: 'test' }) },
        },
        {
          provide: VideoInputsService,
          useValue: {
            cycle: () => Promise.resolve('inputs'),
          },
        },
        {
          provide: FfmpegService,
          useValue: {
            probeMedia: () =>
              Promise.resolve({
                streams: [],
                format: { duration: '20' },
              }),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();

    app.useGlobalPipes(new ZodValidationPipe());

    await app.init();

    state = module.get(StateManagerService);

    const project = await state.initProject(
      'Exports',
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

    await fs.mkdir(state.getArtifactPath(id, 'video/cycle'), {
      recursive: true,
    });
    await fs.writeFile(
      state.getArtifactPath(id, 'video/cycle/test.mp4'),
      Buffer.alloc(100, 7),
    );
    await state.updateState(id, (current) => {
      current.video = {
        style: videoStyleSchema.parse({}),
        cycle: {
          path: 'video/cycle/test.mp4',
          duration: 20,
          fps: 30,
          loop: true,
          planHash: 'plan',
          inputHash: 'inputs',
        },
      };
    });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('supports bounded, suffix and unsatisfiable Range requests with attachment disposition', async () => {
    const url = `/api/projects/${id}/exports/video_loop/download`;

    await request(app.getHttpServer())
      .get(url)
      .set('Range', 'bytes=10-19')
      .expect(206)
      .expect('Content-Range', 'bytes 10-19/100')
      .expect('Content-Length', '10')
      .expect('Content-Disposition', /attachment/);
    await request(app.getHttpServer())
      .get(url)
      .set('Range', 'bytes=-5')
      .expect(206)
      .expect('Content-Range', 'bytes 95-99/100');
    await request(app.getHttpServer())
      .get(url)
      .set('Range', 'bytes=200-')
      .expect(416);
  });

  it('streams a stored ZIP with a correct central directory', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/projects/${id}/exports/zip?kinds=video_loop`)
      .buffer(true)
      .parse(
        (
          stream: IncomingMessage,
          callback: (error: Error | null, body?: Buffer) => void,
        ) => {
          const chunks: Buffer[] = [];

          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => callback(null, Buffer.concat(chunks)));
          stream.on('error', callback);
        },
      )
      .expect(200);
    const bytes: unknown = response.body;

    expect(Buffer.isBuffer(bytes)).toBe(true);

    if (!Buffer.isBuffer(bytes)) {
      throw new Error('Expected streamed ZIP bytes');
    }

    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.readUInt16LE(8)).toBe(0);
    expect(bytes.includes(Buffer.from(`${id}_video_loop.mp4`))).toBe(true);
    expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
    expect(bytes.readUInt16LE(bytes.length - 12)).toBe(1);
  });

  it('reports soundtrack revision changes as stale and rejects unsafe formats and kinds', async () => {
    await fs.writeFile(
      state.getArtifactPath(id, 'output/master_final.flac'),
      Buffer.alloc(10),
    );
    await state.updateState(id, (current) => {
      current.outputFiles.flac = 'output/master_final.flac';
      current.mixNeedsRebuild = true;
    });

    const response = await request(app.getHttpServer())
      .get(`/api/projects/${id}/exports`)
      .expect(200);
    const artifacts: unknown = response.body;

    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'mixed_audio', stale: true }),
      ]),
    );

    await request(app.getHttpServer())
      .get(`/api/projects/${id}/exports/mixed_audio/download`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/projects/${id}/exports/video_loop/download?format=exe`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/projects/${id}/exports/zip?kinds=../../secret`)
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/projects/${id}/exports/video_full/build`)
      .send({ durationSec: -1 })
      .expect(400);
  });

  it('invalidates final mux provenance independently from full video exports', async () => {
    await fs.writeFile(
      state.getArtifactPath(id, 'output/master_final.flac'),
      Buffer.alloc(10),
    );

    const stat = await fs.stat(
      state.getArtifactPath(id, 'output/master_final.flac'),
    );

    await state.updateState(id, (current) => {
      current.outputFiles.flac = 'output/master_final.flac';
      current.video!.output = 'video/cycle/test.mp4';
      current.video!.outputHash = `${stat.size}:${stat.mtimeMs}`;
      current.video!.outputCycleHash = 'plan';
      current.video!.full = {
        path: 'video/cycle/test.mp4',
        cycleHash: 'plan',
        durationSec: 20,
      };
    });

    const registry = app.get(ExportService);

    expect(
      (await registry.list(id)).find((item) => item.kind === 'final_mp4')
        ?.stale,
    ).toBe(false);
    expect(
      (await registry.list(id)).find((item) => item.kind === 'video_full')
        ?.stale,
    ).toBe(false);

    await state.updateState(id, (current) => {
      current.video!.outputCycleHash = 'old-plan';
    });

    expect(
      (await registry.list(id)).find((item) => item.kind === 'final_mp4')
        ?.stale,
    ).toBe(true);

    await state.updateState(id, (current) => {
      current.video!.outputCycleHash = 'plan';
    });
    await fs.appendFile(
      state.getArtifactPath(id, 'output/master_final.flac'),
      Buffer.alloc(1),
    );

    expect(
      (await registry.list(id)).find((item) => item.kind === 'final_mp4')
        ?.stale,
    ).toBe(true);
  });
});
