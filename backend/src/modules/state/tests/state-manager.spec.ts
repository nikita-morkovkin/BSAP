import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { outlineSchema, profileSchema, stateSchema } from '../schemas';
import { StateManagerService } from '../state-manager.service';
import { StateModule } from '../state.module';
import { Profile, State } from '../types';

describe('StateManagerService', () => {
  let directory: string;
  let service: StateManagerService;
  let profile: Profile;
  let state: State;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-state-'));

    const module = await Test.createTestingModule({ imports: [StateModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ PROJECTS_DIR: directory }))
      .compile();

    service = module.get(StateManagerService);
    profile = profileSchema.parse({
      architectModel: 'architect',
      writerModel: 'writer',
      architectReasoningEffort: 'high',
      writerReasoningEffort: 'none',
      temperature: 0.7,
      architectSystemPrompt: 'Create a scientific outline.',
      writerSystemPrompt: 'Write soothing narration.',
      ttsVoice: 'bm_george*0.65+bm_lewis*0.35',
      ttsSpeed: 0.85,
      masteringConfig: {},
    });
    state = await service.initProject('Quiet Stars', profile);
  });

  afterEach(async () => {
    jest.restoreAllMocks();

    await fs.rm(directory, { recursive: true, force: true });
  });

  it('initializes a valid state and all artifact directories', async () => {
    const contents: unknown = JSON.parse(
      await fs.readFile(join(directory, state.projectId, 'state.json'), 'utf8'),
    );

    expect(stateSchema.parse(contents)).toEqual(state);
    expect(state.projectId).toBe('001-quiet-stars');
    expect(state.status).toBe('IDLE');

    for (const path of ['chapters', 'chunks', 'chunks/silence', 'output']) {
      expect(
        (await fs.stat(join(directory, state.projectId, path))).isDirectory(),
      ).toBe(true);
    }

    expect(existsSync(join(directory, state.projectId, 'state.json.tmp'))).toBe(
      false,
    );
  });

  describe('with four chunks', () => {
    beforeEach(async () => {
      state = await service.updateState(state.projectId, (current) => {
        current.chapters['1'] = {
          chapterNumber: 1,
          title: 'A Quiet Star',
          scriptStatus: 'PENDING',
          ttsStatus: 'PENDING',
          scriptFilePath: 'chapters/ch_01_raw.txt',
          audioFilePath: 'chapters/ch_01_master.wav',
          durationMs: 0,
          chunks: Array.from({ length: 4 }, (_, index) => ({
            id: `chunk-${index}`,
            index,
            text: 'Starlight drifts softly through the night.',
            pauseAfterMs: 600,
            status: 'PENDING',
            filePath: `chunks/ch_01_chunk_${String(index).padStart(3, '0')}.wav`,
            durationMs: 0,
          })),
        };
      });
    });

    it('returns a deleted completed WAV alongside the two uncompleted chunks after restart', async () => {
      const chunks = state.chapters['1'].chunks;

      for (const chunk of chunks.slice(0, 2)) {
        await fs.writeFile(
          service.getArtifactPath(state.projectId, chunk.filePath),
          Buffer.from('dummy wav'),
        );
        await service.markChunkCompleted(state.projectId, 1, chunk.id, 1200);
      }

      expect(
        (await service.getPendingChunks(state.projectId, 1)).map(
          (chunk) => chunk.id,
        ),
      ).toEqual(['chunk-2', 'chunk-3']);

      await fs.unlink(
        service.getArtifactPath(state.projectId, chunks[0].filePath),
      );

      const restarted = new StateManagerService(
        new ConfigService({ PROJECTS_DIR: directory }),
      );
      const pending = await restarted.getPendingChunks(state.projectId, 1);

      expect(pending.map((chunk) => chunk.id)).toEqual([
        'chunk-0',
        'chunk-2',
        'chunk-3',
      ]);
      expect(
        stateSchema.safeParse(await restarted.getState(state.projectId))
          .success,
      ).toBe(true);
    });

    it('requires both completed script status and an existing script file', async () => {
      const path = service.getArtifactPath(
        state.projectId,
        state.chapters['1'].scriptFilePath,
      );

      await fs.writeFile(path, 'A soothing script.');

      expect(await service.getPendingChapters(state.projectId)).toHaveLength(1);

      await service.updateState(state.projectId, (current) => {
        current.chapters['1'].scriptStatus = 'COMPLETED';
      });

      expect(await service.getPendingChapters(state.projectId)).toHaveLength(0);

      await fs.unlink(path);

      expect(await service.getPendingChapters(state.projectId)).toHaveLength(1);
    });

    it('does not lose concurrent chunk updates or expose partial JSON to polling readers', async () => {
      for (const chunk of state.chapters['1'].chunks) {
        await fs.writeFile(
          service.getArtifactPath(state.projectId, chunk.filePath),
          'dummy wav',
        );
      }

      await Promise.all([
        ...state.chapters['1'].chunks.map((chunk) =>
          service.markChunkCompleted(state.projectId, 1, chunk.id, 1500),
        ),
        ...Array.from({ length: 20 }, async () => {
          expect(
            stateSchema.safeParse(await service.getState(state.projectId))
              .success,
          ).toBe(true);
        }),
      ]);

      expect(await service.getPendingChunks(state.projectId, 1)).toEqual([]);
      expect(
        (await service.getState(state.projectId)).chapters['1'].chunks.every(
          (chunk) => chunk.durationMs === 1500,
        ),
      ).toBe(true);
    });

    it('refuses completion without files and validates chapter assembly prerequisites', async () => {
      await expect(
        service.markChunkCompleted(state.projectId, 1, 'chunk-0', 1200),
      ).rejects.toThrow('missing');
      await expect(
        service.markChapterAudioCompleted(state.projectId, 1, 6000),
      ).rejects.toThrow('missing');
      await fs.writeFile(
        service.getArtifactPath(
          state.projectId,
          state.chapters['1'].audioFilePath,
        ),
        'dummy chapter wav',
      );
      await expect(
        service.markChapterAudioCompleted(state.projectId, 1, 6000),
      ).rejects.toThrow('pending or missing');

      for (const chunk of state.chapters['1'].chunks) {
        await fs.writeFile(
          service.getArtifactPath(state.projectId, chunk.filePath),
          'dummy wav',
        );
        await service.markChunkCompleted(state.projectId, 1, chunk.id, 1200);
      }

      await service.markChapterAudioCompleted(state.projectId, 1, 6000);
      await service.markChapterAudioCompleted(state.projectId, 1, 6000);

      expect(
        (await service.getState(state.projectId)).chapters['1'],
      ).toMatchObject({ ttsStatus: 'COMPLETED', durationMs: 6000 });

      await fs.unlink(
        service.getArtifactPath(
          state.projectId,
          state.chapters['1'].audioFilePath,
        ),
      );

      await expect(
        service.markChapterAudioCompleted(state.projectId, 1, 6000),
      ).rejects.toThrow('missing');
      await expect(
        service.markChunkCompleted(state.projectId, 1, 'chunk-0', -1),
      ).rejects.toThrow('positive safe integer');
      await expect(
        service.markChunkCompleted(state.projectId, 1, 'unknown', 1200),
      ).rejects.toThrow('Unknown chunk');
      await expect(
        service.getPendingChunks(state.projectId, 2),
      ).rejects.toThrow('Unknown chapter');
    });
  });

  it('preserves the previous state on rename failure and permits subsequent writes', async () => {
    const rename = jest
      .spyOn(fs, 'rename')
      .mockRejectedValueOnce(new Error('simulated rename failure'));

    await expect(
      service.updateState(state.projectId, (current) => {
        current.status = 'GENERATING_OUTLINE';
      }),
    ).rejects.toThrow('simulated rename failure');

    expect(rename).toHaveBeenCalledWith(
      join(directory, state.projectId, 'state.json.tmp'),
      join(directory, state.projectId, 'state.json'),
    );
    expect(await service.getState(state.projectId)).toEqual(state);
    expect(existsSync(join(directory, state.projectId, 'state.json.tmp'))).toBe(
      false,
    );

    await service.updateState(state.projectId, (current) => {
      current.status = 'GENERATING_OUTLINE';
    });

    expect((await service.getState(state.projectId)).status).toBe(
      'GENERATING_OUTLINE',
    );
  });

  it('allocates unique sequential URL-safe IDs for concurrent projects', async () => {
    const projects = await Promise.all(
      ['Deep Oceans', 'Deep Oceans', '✨'].map((topic) =>
        service.initProject(topic, profile),
      ),
    );

    expect(projects.map((project) => project.projectId)).toEqual([
      '002-deep-oceans',
      '003-deep-oceans',
      '004-project',
    ]);
  });

  it('rejects invalid state, traversal, malformed JSON, and identity mismatches', async () => {
    expect(() => service.getProjectDirectory('../escape')).toThrow();
    expect(() =>
      service.getArtifactPath(state.projectId, '../escape.wav'),
    ).toThrow();
    expect(() =>
      service.getArtifactPath(state.projectId, 'C:\\escape.wav'),
    ).toThrow();

    await expect(
      service.updateState(state.projectId, (current) => {
        current.chapters['0'] = { ...current.chapters['1'] };
      }),
    ).rejects.toThrow();

    expect(await service.getState(state.projectId)).toEqual(state);

    const path = join(directory, state.projectId, 'state.json');

    await fs.writeFile(path, '{broken');

    await expect(service.getState(state.projectId)).rejects.toThrow();
    await fs.writeFile(
      path,
      JSON.stringify({ ...state, projectId: '999-other' }),
    );

    await expect(service.getState(state.projectId)).rejects.toThrow(
      'does not match',
    );
  });

  it('rejects invalid profile fields and inconsistent outlines', () => {
    expect(
      profileSchema.safeParse({ ...profile, writerReasoningEffort: '' })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...profile, maxChunkChars: 201 }).success,
    ).toBe(false);
    expect(profileSchema.safeParse({ ...profile, ttsSpeed: 0 }).success).toBe(
      false,
    );
    expect(
      profileSchema.safeParse({ ...profile, temperature: NaN }).success,
    ).toBe(false);
    expect(profileSchema.safeParse({ ...profile, unknown: true }).success).toBe(
      false,
    );

    const outline = {
      topic: 'Stars',
      totalChapters: 1,
      chapters: [
        {
          chapterNumber: 1,
          title: 'Starlight',
          keyScientificFacts: ['Stars emit light.'],
          sensoryThemes: ['Soft warmth'],
          targetWordCount: 1000,
        },
      ],
    };

    expect(outlineSchema.safeParse(outline).success).toBe(true);
    expect(
      outlineSchema.safeParse({ ...outline, totalChapters: 2 }).success,
    ).toBe(false);
    expect(
      outlineSchema.safeParse({
        ...outline,
        chapters: [outline.chapters[0], outline.chapters[0]],
        totalChapters: 2,
      }).success,
    ).toBe(false);
  });
});
