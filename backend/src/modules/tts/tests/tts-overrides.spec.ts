import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PIPELINE_JOBS } from '../../queue/consts';
import { profileSchema } from '../../state/schemas';
import { StateManagerService } from '../../state/state-manager.service';
import type { TtsJob } from '../../text/types/tts-job.type';
import { AudioProbeService } from '../audio-probe.service';
import { ChapterAssemblyQueueService } from '../chapter-assembly-queue.service';
import { KokoroTtsAdapter } from '../kokoro-tts.adapter';
import { TtsProcessor } from '../tts.processor';

describe('TTS chunk regeneration overrides', () => {
  it('uses persisted chunk settings, preserves siblings, and hands off chapter assembly', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'bsap-overrides-'));
    const synthesize = jest.fn(async (_text: string, path: string) => {
      await fs.writeFile(path, 'regenerated WAV');
    });
    const enqueueChapter = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        StateManagerService,
        TtsProcessor,
        {
          provide: ConfigService,
          useValue: new ConfigService({ PROJECTS_DIR: directory }),
        },
        { provide: KokoroTtsAdapter, useValue: { synthesize } },
        {
          provide: AudioProbeService,
          useValue: { getDurationMs: jest.fn().mockResolvedValue(1200) },
        },
        { provide: ChapterAssemblyQueueService, useValue: { enqueueChapter } },
      ],
    }).compile();

    try {
      const manager = module.get(StateManagerService);
      const profile = profileSchema.parse({
        architectModel: 'architect',
        writerModel: 'writer',
        architectReasoningEffort: 'high',
        writerReasoningEffort: 'none',
        temperature: 0.7,
        architectSystemPrompt: 'Outline.',
        writerSystemPrompt: 'Narrate.',
        ttsVoice: 'default-voice',
        ttsSpeed: 0.85,
        masteringConfig: {},
      });
      const state = await manager.initProject('Stars', profile);

      await fs.writeFile(
        manager.getArtifactPath(state.projectId, 'chunks/sibling.wav'),
        'unchanged WAV',
      );
      await manager.updateState(state.projectId, (current) => {
        current.status = 'SYNTHESIZING_AUDIO';
        current.chapters['1'] = {
          chapterNumber: 1,
          title: 'Stars',
          scriptStatus: 'COMPLETED',
          ttsStatus: 'PENDING',
          scriptFilePath: 'chapters/ch_01_raw.txt',
          audioFilePath: 'chapters/ch_01_master.wav',
          durationMs: 0,
          chunks: [
            {
              id: 'target',
              index: 0,
              text: 'A quiet star.',
              pauseAfterMs: 800,
              ttsVoice: 'override-voice',
              ttsSpeed: 0.9,
              status: 'PENDING',
              durationMs: 0,
              filePath: 'chunks/target.wav',
            },
            {
              id: 'sibling',
              index: 1,
              text: 'Another star.',
              pauseAfterMs: 500,
              status: 'COMPLETED',
              durationMs: 1000,
              filePath: 'chunks/sibling.wav',
            },
          ],
        };
      });

      const before = await manager.getState(state.projectId);
      const job = {
        name: PIPELINE_JOBS.synthesizeChunk,
        data: {
          projectId: state.projectId,
          chapterNumber: 1,
          chunkId: 'target',
        },
      } as Job<TtsJob>;

      await module.get(TtsProcessor).process(job);

      const after = await manager.getState(state.projectId);

      expect(synthesize).toHaveBeenCalledTimes(1);
      expect(synthesize).toHaveBeenCalledWith(
        'A quiet star.',
        manager.getArtifactPath(state.projectId, 'chunks/target.wav'),
        { ...profile, ttsVoice: 'override-voice', ttsSpeed: 0.9 },
      );
      expect(after.profile).toEqual(profile);
      expect(after.chapters['1'].chunks[0]).toMatchObject({
        status: 'COMPLETED',
        durationMs: 1200,
        pauseAfterMs: 800,
      });
      expect(after.chapters['1'].chunks[1]).toEqual(
        before.chapters['1'].chunks[1],
      );
      expect(
        await fs.readFile(
          manager.getArtifactPath(state.projectId, 'chunks/sibling.wav'),
          'utf8',
        ),
      ).toBe('unchanged WAV');
      expect(enqueueChapter).toHaveBeenCalledWith({
        projectId: state.projectId,
        chapterNumber: 1,
      });
    } finally {
      await module.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
