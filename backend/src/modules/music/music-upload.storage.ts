import { PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import type { IncomingMessage } from 'http';
import { join } from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ambientRoot, safeMusicPath } from './utils';

export class MusicUploadStorage {
  constructor(private readonly config: ConfigService) {}

  public _handleFile(
    request: IncomingMessage,
    file: { stream: Readable },
    callback: (
      error: Error | null,
      info?: { path: string; size: number },
    ) => void,
  ): void {
    this.store(request, file.stream).then(
      (info) => callback(null, info),
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error('Upload failed')),
    );
  }

  public _removeFile(
    _request: IncomingMessage,
    file: { path: string },
    callback: (error: Error | null) => void,
  ): void {
    fs.rm(file.path, { force: true }).then(
      () => callback(null),
      (error: unknown) =>
        callback(
          error instanceof Error ? error : new Error('Upload cleanup failed'),
        ),
    );
  }

  private async store(
    request: IncomingMessage,
    source: Readable,
  ): Promise<{ path: string; size: number }> {
    const root = ambientRoot(this.config);
    const directory = join(root, '.uploads');

    await fs.mkdir(directory, { recursive: true });
    await safeMusicPath(root, '.uploads');

    const path = join(directory, randomUUID());
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    let limited = false;
    const onLimit = () => {
      limited = true;

      abort.abort();
    };

    request.once('aborted', onAbort);
    source.once('limit', onLimit);

    try {
      if (request.aborted) {
        throw new Error('Upload disconnected');
      }

      await pipeline(source, createWriteStream(path, { flags: 'wx' }), {
        signal: abort.signal,
      });

      if (limited) {
        throw new PayloadTooLargeException(
          'Audio exceeds the configured upload byte limit',
        );
      }

      return { path, size: (await fs.stat(path)).size };
    } catch (error) {
      await fs.rm(path, { force: true });

      if (limited) {
        throw new PayloadTooLargeException(
          'Audio exceeds the configured upload byte limit',
        );
      }

      throw error;
    } finally {
      request.off('aborted', onAbort);
      source.off('limit', onLimit);
    }
  }
}
