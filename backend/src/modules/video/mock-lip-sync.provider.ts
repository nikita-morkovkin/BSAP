import { promises as fs } from 'fs';
import type { LipSyncProvider } from './types/lip-sync-provider.type';

export class MockLipSyncProvider implements LipSyncProvider {
  constructor(
    private readonly source: string,
    private readonly fail = false,
  ) {}

  public async submit(
    videoPath: string,
    audioPath: string,
    key: string,
    signal: AbortSignal,
  ): Promise<string> {
    signal.throwIfAborted();

    await fs.access(videoPath);
    await fs.access(audioPath);

    return key;
  }

  public async poll(
    id: string,
    signal: AbortSignal,
  ): Promise<{ status: 'completed' | 'failed'; error?: string }> {
    signal.throwIfAborted();

    await fs.access(this.source);

    return {
      status: this.fail ? 'failed' : 'completed',
      error: this.fail ? `No face detected (${id})` : undefined,
    };
  }

  public async download(
    id: string,
    destination: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();

    await fs.copyFile(this.source, destination);
  }
}
