import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { setTimeout } from 'timers/promises';
import { writeArtifact } from '../../utils/write-artifact.util';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { SyncLipSyncProvider } from './sync-lip-sync.provider';
import type { LipSyncProvider } from './types/lip-sync-provider.type';
import { encoderArgs, videoHash } from './utils';
import { VideoLibraryService } from './video-library.service';

@Injectable()
export class ExternalLipSyncService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
    private readonly library: VideoLibraryService,
    private readonly provider: SyncLipSyncProvider,
  ) {}

  public async build(
    projectId: string,
    confirm: boolean,
    signal: AbortSignal,
    adapter: LipSyncProvider = this.provider,
  ): Promise<string> {
    if (confirm !== true) {
      throw new BadRequestException(
        'Explicit paid-provider confirmation is required',
      );
    }

    const state = await this.state.getState(projectId);
    const video = state.video;
    const audio = video?.greetingAudio;
    const clips = await this.library.list(projectId, 'character');
    const clip =
      clips.find((item) => item.role === 'talk') ??
      clips.find((item) => item.role === 'greeting_source') ??
      clips[0];

    if (
      !audio ||
      !video?.greeting?.enabled ||
      video.greeting.lipSyncMode !== 'external_lipsync' ||
      !clip
    ) {
      throw new BadRequestException(
        'Generate greeting audio and upload a character first',
      );
    }

    if (
      audio.hash !==
      videoHash({
        text: video.greeting.text,
        voice: state.profile.ttsVoice,
        speed: state.profile.ttsSpeed,
      })
    ) {
      throw new BadRequestException(
        'Greeting audio is outdated; regenerate it before paid submission',
      );
    }

    const hash = videoHash({
      audio: audio.hash,
      clip: clip.sha256,
      provider: 'sync-lipsync-2',
      version: 1,
    });
    const path = `video/character/external_${hash}.mp4`;
    const destination = this.state.getArtifactPath(projectId, path);
    const remotePath = `${destination}.job.json`;

    if (!existsSync(destination)) {
      const source = `${destination}.source.mp4`;
      const style = { ...video.style, width: 1280, height: 720 };

      if (!existsSync(source)) {
        await this.ffmpeg.renderMedia(
          source,
          [
            '-stream_loop',
            '-1',
            '-i',
            this.state.getArtifactPath(projectId, clip.filePath),
            '-vf',
            'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1',
            '-t',
            String(audio.endSec - audio.startSec),
            ...encoderArgs(style),
          ],
          { signal },
        );
      }

      let remoteId: string;

      if (existsSync(remotePath)) {
        remoteId = (await fs.readFile(remotePath, 'utf8')).trim();
      } else {
        remoteId = await adapter.submit(
          source,
          this.state.getArtifactPath(projectId, audio.path),
          videoHash({ projectId, hash }),
          signal,
        );

        await writeArtifact(remotePath, remoteId);
      }

      let complete = false;

      for (let attempt = 0; attempt < 360; attempt += 1) {
        const status = await adapter.poll(remoteId, signal);

        if (status.status === 'failed') {
          throw new Error(
            `${status.error ?? 'External lip sync failed'}. Use the local voice-activity fallback; retries reuse the same paid job.`,
          );
        }

        if (status.status === 'completed') {
          complete = true;

          break;
        }

        await setTimeout(5000, undefined, { signal });
      }

      if (!complete) {
        throw new Error(
          'External job still pending; retry explicitly to resume polling without paying again',
        );
      }

      const temporary = `${destination}.download.mp4`;

      try {
        await adapter.download(remoteId, temporary, signal);
        await this.ffmpeg.probeMedia(temporary);
        await fs.rename(temporary, destination);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    }

    await this.state.updateState(projectId, (current) => {
      if (current.video) {
        current.video.externalGreeting = {
          path,
          audioHash: audio.hash,
          clipHash: clip.sha256,
        };
      }
    });

    return path;
  }
}
