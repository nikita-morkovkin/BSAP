import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { KokoroTtsAdapter } from '../kokoro-tts.adapter';
import { voiceIdSchema } from '../../state/schemas/voice-id.schema';
import type { Profile } from '../../state/types';

describe('Kokoro voice IDs', () => {
  afterEach(() => jest.restoreAllMocks());

  it('migrates legacy weighted formulas to a bare primary voice ID', () => {
    expect(voiceIdSchema.parse('bm_george*0.65+bm_lewis*0.35')).toBe(
      'bm_george',
    );
    expect(voiceIdSchema.parse('bm_george*0.65')).toBe('bm_george');
    expect(voiceIdSchema.safeParse('bm_george+bm_lewis').success).toBe(false);
  });

  it('validates against available voices and sends speed separately', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'bsap-voice-'));
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json({ voices: [{ id: 'bm_george' }] }))
      .mockResolvedValueOnce(new Response('wav-data'));
    const adapter = new KokoroTtsAdapter(
      new ConfigService({
        KOKORO_TTS_URL: 'http://kokoro',
        KOKORO_TIMEOUT_MS: 5000,
      }),
    );
    const profile = { ttsVoice: 'bm_george*0.65', ttsSpeed: 0.85 } as Profile;
    try {
      await adapter.synthesize(
        'Soft starlight.',
        join(directory, 'test.wav'),
        profile,
      );
      expect(fetcher.mock.calls[1][1]?.body).toBe(
        JSON.stringify({
          model: 'kokoro',
          input: 'Soft starlight.',
          voice: 'bm_george',
          speed: 0.85,
          response_format: 'wav',
        }),
      );
      await expect(
        adapter.synthesize('Stars.', join(directory, 'invalid.wav'), {
          ...profile,
          ttsVoice: 'unknown',
        }),
      ).rejects.toThrow('unavailable');
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
