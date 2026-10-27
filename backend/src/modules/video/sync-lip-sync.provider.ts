import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openAsBlob, createWriteStream, promises as fs } from 'fs';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import type { LipSyncProvider } from './types/lip-sync-provider.type';

@Injectable()
export class SyncLipSyncProvider implements LipSyncProvider {
  constructor(private readonly config: ConfigService) {}

  public async submit(
    videoPath: string,
    audioPath: string,
    key: string,
    signal: AbortSignal,
  ): Promise<string> {
    const body = new FormData();

    body.set('model', 'lipsync-2');
    body.set(
      'video',
      await openAsBlob(videoPath, { type: 'video/mp4' }),
      'character.mp4',
    );
    body.set(
      'audio',
      await openAsBlob(audioPath, { type: 'audio/wav' }),
      'greeting.wav',
    );

    const response = await fetch('https://api.sync.so/v2/generate', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.getOrThrow<string>('SYNC_API_KEY'),
        'Idempotency-Key': key,
      },
      body,
      signal,
    });

    if (!response.ok) {
      await response.body?.cancel();

      throw new Error(
        `Sync submission failed: HTTP ${response.status}. Switch to local voice activity mode.`,
      );
    }

    return z
      .object({ id: z.string().min(1).max(128) })
      .parse(await response.json()).id;
  }

  public async poll(
    id: string,
    signal: AbortSignal,
  ): Promise<{ status: 'pending' | 'completed' | 'failed'; error?: string }> {
    const response = await fetch(
      `https://api.sync.so/v2/generate/${encodeURIComponent(id)}`,
      {
        headers: {
          'x-api-key': this.config.getOrThrow<string>('SYNC_API_KEY'),
        },
        signal,
      },
    );

    if (!response.ok) {
      await response.body?.cancel();

      throw new Error(`Sync polling failed: HTTP ${response.status}`);
    }

    const result = z
      .object({
        status: z.enum([
          'PENDING',
          'PROCESSING',
          'COMPLETED',
          'FAILED',
          'REJECTED',
        ]),
        error: z.string().nullish(),
      })
      .parse(await response.json());

    return {
      status:
        result.status === 'COMPLETED'
          ? 'completed'
          : ['FAILED', 'REJECTED'].includes(result.status)
            ? 'failed'
            : 'pending',
      error: result.error?.slice(0, 500),
    };
  }

  public async download(
    id: string,
    destination: string,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await fetch(
      `https://api.sync.so/v2/generations/${encodeURIComponent(id)}/download`,
      {
        headers: {
          'x-api-key': this.config.getOrThrow<string>('SYNC_API_KEY'),
        },
        signal,
      },
    );

    if (!response.ok) {
      await response.body?.cancel();

      throw new Error(`Sync download resolver failed: HTTP ${response.status}`);
    }

    const url = new URL((await response.text()).trim());

    if (url.protocol !== 'https:') {
      throw new Error('Sync returned an insecure result URL');
    }

    const media = await fetch(url, { signal });

    if (!media.ok || !media.body) {
      await media.body?.cancel();

      throw new Error('Sync output download failed');
    }

    let size = 0;
    const limit = new Transform({
      transform(chunk: Buffer, encoding, callback) {
        size += chunk.length;

        callback(
          size > 1024 * 1024 * 1024
            ? new Error('Provider output exceeds 1 GiB')
            : null,
          chunk,
        );
      },
    });

    try {
      await pipeline(
        Readable.from(this.readBody(media.body)),
        limit,
        createWriteStream(destination),
        { signal },
      );
    } catch (error) {
      await fs.rm(destination, { force: true });

      throw error;
    }
  }

  private async *readBody(
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
