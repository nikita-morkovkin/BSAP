import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import type { VideoStyleConfig } from './types/video-style.type';
import { gradeFilter, videoHash } from './utils';
import { VideoLibraryService } from './video-library.service';
import { effectiveEffects } from './utils/effective-effects.util';
import { effectFilter } from './utils/effect-filter.util';

@Injectable()
export class VideoPreviewService {
  constructor(
    private readonly library: VideoLibraryService,
    private readonly ffmpeg: FfmpegService,
    private readonly state: StateManagerService,
  ) {}

  public async frame(
    projectId: string,
    style: VideoStyleConfig,
    clipId?: string,
    effectIds?: string[],
    t = 2,
  ): Promise<string> {
    const clip = clipId
      ? await this.library.get(projectId, clipId)
      : (await this.library.list(projectId)).find((item) => item.enabled);

    if (!clip) {
      throw new BadRequestException('Upload a clip before previewing');
    }

    const previewStyle = { ...style, width: 640, height: 360 };
    const video = (await this.state.getState(projectId)).video;
    const effects = effectiveEffects(
      clip.id,
      video?.effects ?? [],
      effectIds ? { [clip.id]: effectIds } : (video?.effectAssignments ?? {}),
      video?.effectRules,
    );
    const path = this.library.path(
      projectId,
      `preview/frame_${videoHash({ id: clip.id, style: previewStyle, effects, t })}.jpg`,
    );

    if (!existsSync(path)) {
      await this.ffmpeg.renderMedia(path, [
        '-ss',
        String(Math.min(t, clip.durationSec / 2)),
        '-i',
        this.state.getArtifactPath(projectId, clip.filePath),
        ...effects.flatMap((effect) => {
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
            String((offset + t * effect.speed) % effect.durationSec),
            ...(effect.hasAlpha && effect.path.endsWith('.webm')
              ? ['-c:v', 'libvpx-vp9']
              : []),
            '-i',
            this.state.getArtifactPath(projectId, effect.path),
          ];
        }),
        '-filter_complex',
        [
          `[0:v]${gradeFilter({ ...previewStyle, vignetteEnabled: false, antiBanding: false })},settb=AVTB[base]`,
          ...effectFilter(effects, previewStyle, 'base'),
        ].join(';'),
        '-map',
        '[outv]',
        '-frames:v',
        '1',
      ]);
    }

    return path;
  }
}
