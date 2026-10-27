import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { GreetingVadService } from './greeting-vad.service';
import type { VideoStyleConfig } from './types/video-style.type';
import { encoderArgs, quantize, videoHash } from './utils';
import { VideoLibraryService } from './video-library.service';
import { VideoInputsService } from './video-inputs.service';

@Injectable()
export class GreetingRendererService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
    private readonly library: VideoLibraryService,
    private readonly vad: GreetingVadService,
    private readonly inputs: VideoInputsService,
  ) {}

  public async render(
    projectId: string,
    signal: AbortSignal,
    style?: VideoStyleConfig,
  ): Promise<{ path: string; duration: number }> {
    const state = await this.state.getState(projectId);
    const config = state.video?.greeting;
    const audio = state.video?.greetingAudio;
    const selected = style ?? state.video?.style;
    const inputHash = await this.inputs.greeting(projectId);

    if (!config?.enabled || !audio || !selected) {
      throw new BadRequestException(
        'Configure a local greeting and generate its audio first',
      );
    }

    if (
      audio.startSec !== config.leadInSec ||
      audio.hash !==
        (config.lipSyncMode === 'native_veo_audio'
          ? videoHash({ nativeClipId: config.nativeClipId })
          : videoHash({
              text: config.text,
              voice: state.profile.ttsVoice,
              speed: state.profile.ttsSpeed,
            }))
    ) {
      throw new BadRequestException(
        'Greeting text or narrator changed; explicitly regenerate greeting audio',
      );
    }

    const clips = await this.library.list(projectId, 'character');
    const source = clips.find((clip) => clip.role === 'greeting_source');
    const idle = clips.find((clip) => clip.role === 'idle') ?? source;
    const talk = clips.find((clip) => clip.role === 'talk') ?? source;

    if (config.lipSyncMode === 'native_veo_audio') {
      const native = clips.find((clip) => clip.id === config.nativeClipId);

      if (!native?.hasAudio) {
        throw new BadRequestException(
          'Select a native Veo clip containing audio',
        );
      }

      const duration = quantize(
        audio.endSec + config.tailSec + config.pip.fadeOutSec,
        selected.fps,
      );
      const relative = `video/character/native_${videoHash({ native: native.sha256, config, selected })}.mp4`;
      const path = this.state.getArtifactPath(projectId, relative);

      if (!existsSync(path)) {
        await this.ffmpeg.renderMedia(
          path,
          [
            '-i',
            this.state.getArtifactPath(projectId, native.filePath),
            '-vf',
            `scale=${selected.width}:${selected.height}:force_original_aspect_ratio=increase,crop=${selected.width}:${selected.height},setsar=1,tpad=start_mode=clone:start_duration=${audio.startSec}:stop_mode=clone:stop_duration=${config.tailSec + config.pip.fadeOutSec},eq=brightness=-0.08:saturation=0.9`,
            '-t',
            String(duration),
            ...encoderArgs(selected),
          ],
          { signal, duration },
        );
      }

      await this.state.updateState(projectId, (current) => {
        if (current.video && !style) {
          current.video.greetingClip = relative;
          current.video.greetingClipInputHash = inputHash;
        }
      });

      return { path, duration };
    }

    if (config.lipSyncMode === 'external_lipsync') {
      const external = state.video?.externalGreeting;
      const selectedClip =
        clips.find((clip) => clip.role === 'talk') ?? source ?? clips[0];

      if (
        !external ||
        external.audioHash !== audio.hash ||
        external.clipHash !== selectedClip?.sha256
      ) {
        throw new BadRequestException(
          'Explicitly confirm and generate external lip sync, or switch to local mode',
        );
      }

      const duration = quantize(
        audio.endSec + config.tailSec + config.pip.fadeOutSec,
        selected.fps,
      );
      const relative = `video/character/external_window_${videoHash({ external, config, selected })}.mp4`;
      const path = this.state.getArtifactPath(projectId, relative);

      if (!existsSync(path)) {
        await this.ffmpeg.renderMedia(
          path,
          [
            '-i',
            this.state.getArtifactPath(projectId, external.path),
            '-vf',
            `scale=${selected.width}:${selected.height}:force_original_aspect_ratio=increase,crop=${selected.width}:${selected.height},setsar=1,tpad=start_mode=clone:start_duration=${audio.startSec}:stop_mode=clone:stop_duration=${config.tailSec + config.pip.fadeOutSec},eq=brightness=-0.08:saturation=0.9`,
            '-t',
            String(duration),
            ...encoderArgs(selected),
          ],
          { signal, duration },
        );
      }

      await this.state.updateState(projectId, (current) => {
        if (current.video && !style) {
          current.video.greetingClip = relative;
          current.video.greetingClipInputHash = inputHash;
        }
      });

      return { path, duration };
    }

    if (!idle || !talk) {
      throw new BadRequestException(
        'Upload idle and talk clips, or one single-source clip',
      );
    }

    const duration = quantize(
      audio.endSec + config.tailSec + config.pip.fadeOutSec,
      selected.fps,
    );

    if (duration > 120) {
      throw new BadRequestException(
        'Greeting window must not exceed two minutes',
      );
    }

    const hash = videoHash({
      config,
      audio,
      idle: idle.sha256,
      talk: talk.sha256,
      selected,
    });
    const relative = `video/character/greeting_${hash}.mp4`;
    const path = this.state.getArtifactPath(projectId, relative);

    if (!existsSync(path)) {
      const analysis = await this.vad.analyze(projectId);
      const frames = Math.round(duration * selected.fps);
      const mask = Buffer.alloc(frames);
      const transition = Math.max(1 / selected.fps, config.transitionMs / 1000);

      for (let frame = 0; frame < frames; frame += 1) {
        const time = frame / selected.fps - audio.startSec;
        let weight = 0;

        for (const segment of analysis.segments) {
          if (segment.speaking) {
            weight = Math.max(
              weight,
              Math.max(
                0,
                Math.min(
                  1,
                  (time - segment.start + transition / 2) / transition,
                  (segment.end - time + transition / 2) / transition,
                ),
              ),
            );
          }
        }

        mask[frame] = Math.round(weight * 255);
      }

      const maskPath = this.state.getArtifactPath(
        projectId,
        `video/character/mask_${hash}.gray`,
      );

      await fs.mkdir(this.library.path(projectId, 'character'), {
        recursive: true,
      });
      await fs.writeFile(maskPath, mask);

      const idleFilter = idle.id === talk.id ? 'trim=duration=1,' : '';
      const filters = [
        `[0:v]${idleFilter}scale=${selected.width}:${selected.height}:force_original_aspect_ratio=increase,crop=${selected.width}:${selected.height},fps=${selected.fps},setsar=1,setpts=PTS-STARTPTS,format=yuv420p[idle]`,
        `[1:v]scale=${selected.width}:${selected.height}:force_original_aspect_ratio=increase,crop=${selected.width}:${selected.height},fps=${selected.fps},setsar=1,setpts=PTS-STARTPTS,format=yuv420p[talk]`,
        `[2:v]scale=${selected.width}:${selected.height}:flags=neighbor,format=yuv420p[mask]`,
        '[idle][talk][mask]maskedmerge,eq=brightness=-0.08:saturation=0.9[out]',
      ];

      // Single-source pauses loop its first second, rather than freezing a frame.
      if (idle.id === talk.id) {
        filters[0] = filters[0].replace(
          'trim=duration=1,',
          `trim=duration=1,fps=${selected.fps},loop=loop=-1:size=${selected.fps}:start=0,`,
        );
      }

      await this.ffmpeg.renderMedia(
        path,
        [
          '-stream_loop',
          '-1',
          '-i',
          this.state.getArtifactPath(projectId, idle.filePath),
          '-stream_loop',
          '-1',
          '-i',
          this.state.getArtifactPath(projectId, talk.filePath),
          '-f',
          'rawvideo',
          '-pixel_format',
          'gray',
          '-video_size',
          '1x1',
          '-framerate',
          String(selected.fps),
          '-i',
          maskPath,
          '-filter_complex',
          filters.join(';'),
          '-map',
          '[out]',
          '-t',
          String(duration),
          ...encoderArgs(selected),
        ],
        { signal, duration },
      );
    }

    await this.state.updateState(projectId, (current) => {
      if (current.video && !style) {
        current.video.greetingClip = relative;
        current.video.greetingClipInputHash = inputHash;
      }
    });

    return { path, duration };
  }
}
