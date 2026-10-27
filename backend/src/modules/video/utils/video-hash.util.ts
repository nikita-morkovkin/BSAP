import { createHash } from 'crypto';

export const videoHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
