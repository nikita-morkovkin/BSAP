import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export async function musicHash(path: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return hash.digest('hex');
}
