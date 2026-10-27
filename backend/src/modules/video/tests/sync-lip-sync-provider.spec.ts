import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SyncLipSyncProvider } from '../sync-lip-sync.provider';

describe('Sync reference adapter HTTP contract', () => {
  let directory: string;
  let provider: SyncLipSyncProvider;
  const signal = new AbortController().signal;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-sync-'));
    provider = new SyncLipSyncProvider(
      new ConfigService({ SYNC_API_KEY: 'private-test-key' }),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();

    await fs.rm(directory, { recursive: true, force: true });
  });

  it('uploads multipart local files with API-key auth and the idempotency gate', async () => {
    const video = join(directory, 'source.mp4');
    const audio = join(directory, 'greeting.wav');

    await fs.writeFile(video, 'video');
    await fs.writeFile(audio, 'audio');

    const transport = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'remote-id' }));

    expect(await provider.submit(video, audio, 'action-key', signal)).toBe(
      'remote-id',
    );

    const [url, init] = transport.mock.calls[0];

    expect(url).toBe('https://api.sync.so/v2/generate');
    expect(init?.headers).toEqual({
      'x-api-key': 'private-test-key',
      'Idempotency-Key': 'action-key',
    });
    expect(init?.body).toBeInstanceOf(FormData);

    if (!(init?.body instanceof FormData)) {
      throw new Error('Expected multipart upload');
    }

    expect(init.body.get('model')).toBe('lipsync-2');
    expect(init.body.get('video')).toBeInstanceOf(Blob);
    expect(init.body.get('audio')).toBeInstanceOf(Blob);
  });

  it.each([
    ['PENDING', 'pending'],
    ['PROCESSING', 'pending'],
    ['COMPLETED', 'completed'],
    ['FAILED', 'failed'],
    ['REJECTED', 'failed'],
  ])('maps provider status %s', async (remote, local) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ status: remote, error: null }));

    expect((await provider.poll('remote-id', signal)).status).toBe(local);
  });

  it('resolves text/plain download URLs and never forwards the API key to result storage', async () => {
    const transport = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('https://storage.example/output.mp4'))
      .mockResolvedValueOnce(new Response('media-bytes'));
    const destination = join(directory, 'download.mp4');

    await provider.download('remote-id', destination, signal);

    expect(await fs.readFile(destination, 'utf8')).toBe('media-bytes');
    expect(transport.mock.calls[1][1]?.headers).toBeUndefined();
  });

  it('rejects HTTP failures and insecure download URLs', async () => {
    const transport = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429 }));

    await expect(provider.poll('remote-id', signal)).rejects.toThrow(
      'HTTP 429',
    );

    transport.mockResolvedValueOnce(
      new Response('http://storage.example/output.mp4'),
    );

    await expect(
      provider.download('remote-id', join(directory, 'output.mp4'), signal),
    ).rejects.toThrow('insecure');
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
