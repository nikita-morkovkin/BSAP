import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, promises as fs } from 'fs';
import { dirname } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import { voiceIdSchema } from '../state/schemas/voice-id.schema';
import type { Profile } from '../state/types/profile.type';
import type { ITtsAdapter } from '../state/types/tts.type';

@Injectable()
export class KokoroTtsAdapter implements ITtsAdapter {
  private readonly kokoroTtsUrl: string;
  private readonly kokoroTimeoutMs: number;
  private voicesCache?: { ids: string[]; expires: number };

  constructor(private readonly configService: ConfigService) {
    this.kokoroTtsUrl = this.configService.getOrThrow<string>('KOKORO_TTS_URL');
    this.kokoroTimeoutMs = Number(
      this.configService.getOrThrow('KOKORO_TIMEOUT_MS'),
    );
  }

  public async synthesize(
    text: string,
    outputPath: string,
    profile: Profile,
  ): Promise<void> {
    const baseUrl = this.kokoroTtsUrl;
    const timeoutMs = this.kokoroTimeoutMs;

    const signal = AbortSignal.timeout(timeoutMs);
    const voice = voiceIdSchema.parse(profile.ttsVoice);
    if (!this.voicesCache || this.voicesCache.expires < Date.now()) {
      const catalog = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/v1/audio/voices`,
        { signal },
      );

      if (!catalog.ok) {
        await catalog.body?.cancel();
        throw new Error(`Kokoro voice catalog failed: HTTP ${catalog.status}`);
      }

      const payload = z
        .object({
          voices: z.array(z.union([z.string(), z.object({ id: z.string() })])),
        })
        .parse(await catalog.json());

      this.voicesCache = {
        ids: payload.voices.map((entry) =>
          typeof entry === 'string' ? entry : entry.id,
        ),
        expires: Date.now() + 60000,
      };
    }

    if (!this.voicesCache.ids.includes(voice)) {
      throw new Error(
        `Kokoro voice "${voice}" is unavailable. Select a voice from the available voices list.`,
      );
    }

    const response = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/v1/audio/speech`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice,
          speed: profile.ttsSpeed,
          response_format: 'wav',
        }),
        signal,
      },
    );

    if (!response.ok || !response.body) {
      await response.body?.cancel();

      throw new Error(`Kokoro speech request failed: HTTP ${response.status}`);
    }

    await fs.mkdir(dirname(outputPath), { recursive: true });

    try {
      await pipeline(
        Readable.from(this.readResponse(response.body)),
        createWriteStream(outputPath),
        { signal },
      );
    } catch (error) {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);

      throw error;
    }
  }

  private async *readResponse(
    body: NonNullable<Response['body']>,
  ): AsyncGenerator<Uint8Array> {
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          return;
        }

        yield value;
      }
    } finally {
      await reader.cancel().catch(() => undefined);

      reader.releaseLock();
    }
  }
}
