import { Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import type { EffectPreset } from './types/effect-preset.type';
import { videoHash } from './utils';
import { presetField } from './utils/preset-field.util';
import { VideoEffectsService } from './video-effects.service';

@Injectable()
export class EffectGeneratorService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
    private readonly effects: VideoEffectsService,
  ) {}

  public async generate(
    projectId: string,
    preset: EffectPreset,
    signal: AbortSignal,
  ): Promise<string> {
    const hash = videoHash({ ...preset, version: 2 });
    const field = this.state.getArtifactPath(
      projectId,
      `video/effects/generated/${hash}.pgm`,
    );
    const path = this.state.getArtifactPath(
      projectId,
      `video/effects/generated/${hash}.mp4`,
    );

    await fs.mkdir(
      this.state.getArtifactPath(projectId, 'video/effects/generated'),
      { recursive: true },
    );

    if (!existsSync(path)) {
      await fs.writeFile(
        field,
        presetField(preset.presetKind, preset.seed, 640, 360),
      );

      const scroll =
        preset.presetKind === 'dust_motes'
          ? 'scroll=h=0.003333333333:v=0.003333333333'
          : preset.presetKind === 'light_rays'
            ? 'scroll=h=0.003333333333:v=0'
            : 'scroll=h=0:v=-0.003333333333';
      const sparkle =
        preset.presetKind === 'plankton_sparkle'
          ? ",eq=contrast='1+0.15*sin(2*PI*t/10)':eval=frame"
          : '';

      await this.ffmpeg.renderMedia(
        path,
        [
          '-loop',
          '1',
          '-framerate',
          '30',
          '-i',
          field,
          '-vf',
          `format=yuv420p,${scroll},gblur=sigma=0.6${sparkle}`,
          '-t',
          '10',
          '-an',
          '-c:v',
          'libx264',
          '-crf',
          '18',
          '-pix_fmt',
          'yuv420p',
          '-bf',
          '0',
        ],
        { signal, duration: 10 },
      );
    }

    const effect = await this.effects.upload(projectId, {
      path,
      originalname: `${preset.presetKind}.mp4`,
      size: (await fs.stat(path)).size,
    });

    signal.throwIfAborted();

    await this.state.updateState(projectId, (current) => {
      const saved = current.video?.effects?.find(
        (item) => item.id === effect.id,
      );

      if (saved) {
        saved.source = 'preset';
        saved.presetKind = preset.presetKind;
        saved.seed = preset.seed;
      }
    });

    return effect.path;
  }
}
