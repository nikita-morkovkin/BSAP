import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StateManagerService } from '../../state/state-manager.service';
import { profileSchema } from '../../state/schemas';
import { FfmpegService } from '../../audio/ffmpeg.service';
import { VideoLibraryService } from '../video-library.service';
import { ExternalLipSyncService } from '../external-lip-sync.service';
import { SyncLipSyncProvider } from '../sync-lip-sync.provider';
import { MockLipSyncProvider } from '../mock-lip-sync.provider';
import { greetingSchema, videoStyleSchema } from '../schemas';
import { videoHash } from '../utils';

describe('External lip sync cost safety and recoverability', () => {
  let directory: string;
  let service: ExternalLipSyncService;
  let state: StateManagerService;
  let id: string;
  let mock: MockLipSyncProvider;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-lipsync-'));
    state = new StateManagerService(
      new ConfigService({ PROJECTS_DIR: directory }),
    );

    const project = await state.initProject(
      'Lip sync',
      profileSchema.parse({
        architectModel: 'test',
        writerModel: 'test',
        architectSystemPrompt: 'test',
        writerSystemPrompt: 'test',
        architectReasoningEffort: 'none',
        writerReasoningEffort: 'none',
        temperature: 0.7,
        ttsVoice: 'bm_george',
        ttsSpeed: 1,
        masteringConfig: {},
      }),
    );

    id = project.projectId;

    const source = join(directory, 'result.mp4');

    await fs.writeFile(source, 'mock video');
    await fs.mkdir(
      state.getArtifactPath(id, 'video/character/0123456789abcdef'),
      { recursive: true },
    );
    await fs.writeFile(
      state.getArtifactPath(id, 'video/character/audio.wav'),
      'audio',
    );
    await fs.writeFile(
      state.getArtifactPath(id, 'video/character/0123456789abcdef/meta.json'),
      JSON.stringify({
        id: '0123456789abcdef',
        role: 'talk',
        sha256: 'source-hash',
        filePath: 'video/character/source.mp4',
        durationSec: 5,
      }),
    );
    await state.updateState(id, (current) => {
      current.video = {
        style: videoStyleSchema.parse({}),
        greeting: greetingSchema.parse({
          enabled: true,
          text: 'Hello',
          lipSyncMode: 'external_lipsync',
        }),
        greetingAudio: {
          path: 'video/character/audio.wav',
          hash: videoHash({ text: 'Hello', voice: 'bm_george', speed: 1 }),
          startSec: 0.6,
          endSec: 2.6,
        },
      };
    });

    const ffmpeg = new FfmpegService(
      new ConfigService(),
      state,
      null!,
      null!,
      null!,
    );

    jest.spyOn(ffmpeg, 'renderMedia').mockImplementation(async (path) => {
      await fs.writeFile(path, 'looped character');

      return '';
    });
    jest
      .spyOn(ffmpeg, 'probeMedia')
      .mockResolvedValue({ streams: [], format: { duration: '2' } });

    service = new ExternalLipSyncService(
      state,
      ffmpeg,
      new VideoLibraryService(state, ffmpeg),
      new SyncLipSyncProvider(new ConfigService()),
    );
    mock = new MockLipSyncProvider(source);
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('never submits without explicit confirmation', async () => {
    const submit = jest.spyOn(mock, 'submit');

    await expect(
      service.build(id, false, new AbortController().signal, mock),
    ).rejects.toThrow('confirmation');

    expect(submit).not.toHaveBeenCalled();
  });

  it('submits, polls, downloads once and reuses cached results without another payment', async () => {
    const submit = jest.spyOn(mock, 'submit');
    const poll = jest.spyOn(mock, 'poll');
    const signal = new AbortController().signal;
    const path = await service.build(id, true, signal, mock);

    expect(await fs.readFile(state.getArtifactPath(id, path), 'utf8')).toBe(
      'mock video',
    );
    expect(await service.build(id, true, signal, mock)).toBe(path);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('keeps failed jobs recoverable and offers local fallback without resubmitting', async () => {
    const source = join(directory, 'result.mp4');
    const failing = new MockLipSyncProvider(source, true);
    const submit = jest.spyOn(failing, 'submit');
    const signal = new AbortController().signal;

    await expect(service.build(id, true, signal, failing)).rejects.toThrow(
      'local voice-activity fallback',
    );
    await expect(service.build(id, true, signal, failing)).rejects.toThrow(
      'No face detected',
    );

    expect(submit).toHaveBeenCalledTimes(1);

    await state.updateState(id, (current) => {
      current.video!.greeting!.lipSyncMode = 'vad_switch';
    });

    expect((await state.getState(id)).video?.greeting?.lipSyncMode).toBe(
      'vad_switch',
    );
  });
});
