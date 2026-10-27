import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { videoProbeSchema } from './schemas';
import type { StockClipMeta } from './types/stock-clip.type';
import type { VideoStyleConfig } from './types/video-style.type';
import type { NormalizedClip } from './types/normalized-clip.type';
import {
  clipTiming,
  encoderArgs,
  gradeFilter,
  quantize,
  styleHash,
} from './utils';
import { VideoLibraryService } from './video-library.service';
import { effectiveEffects } from './utils/effective-effects.util';
import { effectFilter } from './utils/effect-filter.util';
import { videoHash } from './utils/video-hash.util';

@Injectable()
export class VideoNormalizerService {
  constructor(
    private readonly ffmpeg: FfmpegService,
    private readonly state: StateManagerService,
    private readonly library: VideoLibraryService,
  ) {}

  public async normalize(
    projectId: string,
    clip: StockClipMeta,
    style: VideoStyleConfig,
    signal: AbortSignal,
    preview = false,
  ): Promise<NormalizedClip> {
    signal.throwIfAborted();

    const video = (await this.state.getState(projectId)).video;
    const effects = effectiveEffects(
      clip.id,
      video?.effects ?? [],
      video?.effectAssignments ?? {},
      video?.effectRules,
    );
    const hash = videoHash({ style: styleHash(style), effects });
    const path = this.library.path(
      projectId,
      `normalized/${clip.id}__${hash}.mp4`,
    );

    if (existsSync(path) && clip.normalizedDurations[hash]) {
      return { id: clip.id, path, duration: clip.normalizedDurations[hash] };
    }

    const timing = clipTiming(clip.durationSec, style);
    const filters = [
      `[0:v]${gradeFilter({ ...style, vignetteEnabled: false, antiBanding: false })},setpts=${timing.slow}*(PTS-STARTPTS),fps=${style.fps},trim=duration=${timing.baseDuration},settb=AVTB,setpts=PTS-STARTPTS[base]`,
    ];
    let label = 'base';

    for (const [index, extension] of timing.extensions.entries()) {
      filters.push(
        `[${label}]split=2[a${index}][b${index}]`,
        `[a${index}][b${index}]xfade=transition=fade:duration=${extension.fade}:offset=${quantize(extension.duration - extension.fade, style.fps)}[e${index}]`,
      );

      label = `e${index}`;
    }

    filters.push(...effectFilter(effects, style, label));

    const inputs = effects.flatMap((effect) => {
      const offset =
        (parseInt(
          videoHash({ clip: clip.id, effect: effect.id }).slice(0, 8),
          16,
        ) /
          4294967296) *
        effect.durationSec;

      return [
        '-stream_loop',
        '-1',
        '-ss',
        String(offset),
        ...(effect.hasAlpha && effect.path.endsWith('.webm')
          ? ['-c:v', 'libvpx-vp9']
          : []),
        '-i',
        this.state.getArtifactPath(projectId, effect.path),
      ];
    });

    await this.ffmpeg.renderMedia(
      path,
      [
        '-ss',
        String(timing.start),
        '-i',
        this.state.getArtifactPath(projectId, clip.filePath),
        ...inputs,
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[outv]',
        '-t',
        String(timing.duration),
        ...encoderArgs(style, preview),
      ],
      { signal, duration: timing.duration },
    );

    const probe = videoProbeSchema.parse(await this.ffmpeg.probeMedia(path));
    const duration = quantize(Number(probe.format.duration), style.fps);

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Normalization produced an invalid duration');
    }

    clip.normalizedDurations[hash] = duration;

    await this.library.save(projectId, clip);

    return { id: clip.id, path, duration };
  }
}
