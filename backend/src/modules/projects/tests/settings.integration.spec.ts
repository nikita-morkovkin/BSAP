import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CatalogService } from '../catalog.service';
import { ProjectDeletionService } from '../project-deletion.service';
import { StateManagerService } from '../../state/state-manager.service';
import { profileSchema } from '../../state/schemas';
import { KokoroTtsAdapter } from '../../tts/kokoro-tts.adapter';

(process.env.BSAP_SETTINGS_INTEGRATION === '1' ? describe : describe.skip)(
  'Live provider settings and Redis deletion',
  () => {
    it('reads the real Polza reasoning catalog and synthesizes a valid Kokoro voice', async () => {
      const config = new ConfigService({
        POLZA_API_URL: 'https://polza.ai/api/v1',
        POLZA_API_KEY: 'public-catalog',
        KOKORO_TTS_URL: 'http://127.0.0.1:8880',
        KOKORO_TIMEOUT_MS: 60000,
      });
      const catalog = new CatalogService(config);
      const [models, voices] = await Promise.all([
        catalog.getModels(),
        catalog.getVoices(),
      ]);
      expect(models.length).toBeGreaterThan(0);
      expect(
        models.some((model) => model.reasoning.supportedEfforts.length > 0),
      ).toBe(true);
      expect(voices.some((voice) => voice.id === 'bm_george')).toBe(true);
      const directory = await fs.mkdtemp(join(tmpdir(), 'bsap-live-voice-'));
      try {
        const profile = profileSchema.parse({
          architectModel: models[0].id,
          writerModel: models[0].id,
          architectReasoningEffort: 'none',
          writerReasoningEffort: 'none',
          temperature: 0.7,
          architectSystemPrompt: 'Outline.',
          writerSystemPrompt: 'Narrate.',
          ttsVoice: 'bm_george*0.65+bm_lewis*0.35',
          ttsSpeed: 0.85,
          masteringConfig: {},
        });
        const output = join(directory, 'voice.wav');
        await new KokoroTtsAdapter(config).synthesize(
          'Soft starlight rests upon the quiet ocean.',
          output,
          profile,
        );
        const wav = await fs.readFile(output);
        expect(wav.subarray(0, 4).toString()).toBe('RIFF');
        expect(wav.length).toBeGreaterThan(44);
      } finally {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }, 90000);

    it('removes real waiting and delayed jobs without touching another project', async () => {
      const prefix = `bsap-delete-test-${process.pid}-${Date.now()}`;
      const queues = ['scripts', 'text', 'tts', 'audio'].map(
        (name) =>
          new Queue<{ projectId: string }>(name, {
            connection: { host: '127.0.0.1', port: 6379 },
            prefix,
          }),
      );
      const directory = await fs.mkdtemp(join(tmpdir(), 'bsap-live-delete-'));
      const manager = new StateManagerService(
        new ConfigService({ PROJECTS_DIR: directory }),
      );
      try {
        const profile = profileSchema.parse({
          architectModel: 'model',
          writerModel: 'model',
          architectReasoningEffort: 'none',
          writerReasoningEffort: 'none',
          temperature: 0.7,
          architectSystemPrompt: 'Outline.',
          writerSystemPrompt: 'Narrate.',
          ttsVoice: 'bm_george',
          ttsSpeed: 0.85,
          masteringConfig: {},
        });
        const state = await manager.initProject('Delete test', profile);
        await queues[0].add('waiting', { projectId: state.projectId });
        await queues[1].add(
          'delayed',
          { projectId: state.projectId },
          { delay: 60000 },
        );
        const sibling = await queues[0].add('keep', { projectId: '999-other' });
        await new ProjectDeletionService(
          queues[0],
          queues[1],
          queues[2],
          queues[3],
          manager,
        ).deleteProject(state.projectId);
        expect(await queues[0].getJob(sibling.id!)).toBeDefined();
        expect(await queues[0].getJobCounts('wait')).toMatchObject({ wait: 1 });
        expect(await queues[1].getJobCounts('delayed')).toMatchObject({
          delayed: 0,
        });
        expect(
          await Promise.all(queues.map((queue) => queue.isPaused())),
        ).toEqual([false, false, false, false]);
        await expect(manager.getState(state.projectId)).rejects.toMatchObject({
          code: 'ENOENT',
        });
      } finally {
        await Promise.all(
          queues.map(async (queue) => {
            await queue.obliterate({ force: true });
            await queue.close();
          }),
        );
        await fs.rm(directory, { recursive: true, force: true });
      }
    }, 30000);
  },
);
