import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { MusicUploadStorage } from '../music-upload.storage';

describe('Streaming upload cleanup', () => {
  it('removes partially streamed files when a client disconnects', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'bsap-upload-'));
    const request = new IncomingMessage(new Socket());
    const stream = new PassThrough();
    const storage = new MusicUploadStorage(
      new ConfigService({ AMBIENT_DIR: root }),
    );

    try {
      const result = new Promise<Error | null>((resolve) => {
        storage._handleFile(request, { stream }, (error) => resolve(error));
      });

      stream.write(Buffer.alloc(128));

      // Wait for the output stream to be opened before simulating disconnect.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const files = await fs.readdir(join(root, '.uploads')).catch(() => []);

        if (files.length) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      request.emit('aborted');

      expect(await result).toBeInstanceOf(Error);
      expect(await fs.readdir(join(root, '.uploads'))).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
