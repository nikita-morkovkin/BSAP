export interface LipSyncProvider {
  submit(
    videoPath: string,
    audioPath: string,
    key: string,
    signal: AbortSignal,
  ): Promise<string>;
  poll(
    id: string,
    signal: AbortSignal,
  ): Promise<{ status: 'pending' | 'completed' | 'failed'; error?: string }>;
  download(id: string, destination: string, signal: AbortSignal): Promise<void>;
}
