import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PIPELINE_JOBS } from '../../queue/consts/pipeline-jobs.const';
import { profileSchema } from '../../state/schemas/profile.schema';
import { StateManagerService } from '../../state/state-manager.service';
import { ChunkerService } from '../chunker.service';
import { TextNormalizerService } from '../text-normalizer.service';
import { TextPipelineService } from '../text-pipeline.service';
import { TtsQueueService } from '../tts-queue.service';

describe('Text pipeline persistence and resumable TTS handoff', () => {
  let directory: string;
  let projectId: string;
  let stateManager: StateManagerService;
  let pipeline: TextPipelineService;
  let queue: TtsQueueService;
  let add: jest.Mock;
  let getJob: jest.Mock;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-text-'));
    add = jest.fn().mockResolvedValue({});
    getJob = jest.fn().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        StateManagerService,
        TextNormalizerService,
        ChunkerService,
        TextPipelineService,
        TtsQueueService,
        {
          provide: ConfigService,
          useValue: new ConfigService({ PROJECTS_DIR: directory }),
        },
        {
          provide: getQueueToken(PIPELINE_JOBS.ttsQueue),
          useValue: { add, getJob },
        },
      ],
    }).compile();

    stateManager = module.get(StateManagerService);
    pipeline = module.get(TextPipelineService);
    queue = module.get(TtsQueueService);

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
        ttsVoice: 'narrator',
        ttsSpeed: 0.85,
        maxChunkChars: 60,
        masteringConfig: {},
      }),
    );

    projectId = state.projectId;

    await stateManager.updateState(projectId, (current) => {
      current.outlineCompleted = true;

      for (const chapterNumber of [2, 1]) {
        const prefix = `ch_${String(chapterNumber).padStart(2, '0')}`;

        current.chapters[String(chapterNumber)] = {
          chapterNumber,
          title: 'Quiet stars',
          scriptStatus: 'COMPLETED',
          ttsStatus: 'PENDING',
          scriptFilePath: `chapters/${prefix}_raw.txt`,
          audioFilePath: `chapters/${prefix}_master.wav`,
          durationMs: 0,
          chunks: [],
        };
      }
    });

    for (const chapter of [1, 2]) {
      await fs.writeFile(
        join(directory, projectId, `chapters/ch_0${chapter}_raw.txt`),
        'In 1984, **stars** shone.[PAUSE:3.5] Stillness followed.',
      );
    }
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('saves clean JSON, populates validated state, and enqueues in chapter/chunk order', async () => {
    await pipeline.normalizeProject(projectId);

    const state = await stateManager.getState(projectId);
    const chunks = Object.values(state.chapters).flatMap(
      (chapter) => chapter.chunks,
    );

    expect(state.status).toBe('SYNTHESIZING_AUDIO');
    expect(chunks).toHaveLength(4);
    expect(chunks[0].pauseAfterMs).toBe(3500);
    expect(
      chunks.every(
        (chunk) => chunk.text.length <= 60 && !/\d/.test(chunk.text),
      ),
    ).toBe(true);
    expect(
      JSON.parse(
        await fs.readFile(
          join(directory, projectId, 'chapters/ch_01_clean.json'),
          'utf8',
        ),
      ),
    ).toEqual(state.chapters['1'].chunks);
    expect(
      add.mock.calls.map(
        (call: [string, { chunkId: string }]) => call[1].chunkId,
      ),
    ).toEqual(chunks.map((chunk) => chunk.id));
    expect(add).toHaveBeenCalledWith(
      PIPELINE_JOBS.synthesizeChunk,
      { projectId, chapterNumber: 1, chunkId: 'ch_01_chunk_001' },
      expect.objectContaining({
        jobId: `tts-${projectId}-ch_01_chunk_001`,
        attempts: 6,
      }),
    );
  });

  it('preserves completed audio, restores missing clean JSON, and requeues missing audio', async () => {
    await pipeline.normalizeProject(projectId);

    const audio = join(directory, projectId, 'chunks/ch_01_chunk_001.wav');

    await fs.writeFile(audio, 'audio');
    await stateManager.markChunkCompleted(projectId, 1, 'ch_01_chunk_001', 500);
    await fs.unlink(join(directory, projectId, 'chapters/ch_01_clean.json'));
    add.mockClear();

    await pipeline.normalizeProject(projectId);

    expect(add).toHaveBeenCalledTimes(3);
    expect(
      (await stateManager.getState(projectId)).chapters['1'].chunks[0].status,
    ).toBe('COMPLETED');
    expect(
      await fs.stat(join(directory, projectId, 'chapters/ch_01_clean.json')),
    ).toBeDefined();

    await fs.unlink(audio);
    add.mockClear();
    await pipeline.normalizeProject(projectId);

    expect(add).toHaveBeenCalledTimes(4);
  });

  it('recovers from queue failures without discarding persisted chunks', async () => {
    add.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(pipeline.normalizeProject(projectId)).rejects.toThrow(
      'Redis unavailable',
    );

    expect(
      (await stateManager.getState(projectId)).chapters['2'].chunks,
    ).toHaveLength(2);
    expect((await stateManager.getState(projectId)).status).toBe('FAILED');

    await pipeline.normalizeProject(projectId);

    expect((await stateManager.getState(projectId)).error).toBeUndefined();
  });

  it('does not enqueue incomplete scripts or empty narration', async () => {
    await fs.unlink(join(directory, projectId, 'chapters/ch_02_raw.txt'));

    await expect(pipeline.normalizeProject(projectId)).rejects.toThrow(
      'All chapter scripts',
    );

    expect(add).not.toHaveBeenCalled();

    await fs.writeFile(
      join(directory, projectId, 'chapters/ch_02_raw.txt'),
      '[stage]',
    );

    await expect(pipeline.normalizeProject(projectId)).rejects.toThrow(
      'contains no narration',
    );

    expect(add).not.toHaveBeenCalled();
  });

  it('deduplicates pending jobs, retries failed jobs, and replaces completed jobs for lost audio', async () => {
    const job = {
      getState: jest.fn().mockResolvedValue('waiting'),
      retry: jest.fn(),
      remove: jest.fn(),
    };
    const data = { projectId, chapterNumber: 1, chunkId: 'ch_01_chunk_001' };

    getJob.mockResolvedValue(job);

    await queue.enqueueChunk(data);

    expect(add).not.toHaveBeenCalled();

    job.getState.mockResolvedValue('failed');

    await queue.enqueueChunk(data);

    expect(job.retry).toHaveBeenCalledTimes(1);

    job.getState.mockResolvedValue('completed');

    await queue.enqueueChunk(data);

    expect(job.remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });
});
