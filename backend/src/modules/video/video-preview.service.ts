import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import type { VideoStyleConfig } from './types/video-style.type';
import { gradeFilter, videoHash } from './utils';
import { VideoLibraryService } from './video-library.service';

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
  ): Promise<string> {
    const clip = clipId
      ? await this.library.get(projectId, clipId)
      : (await this.library.list(projectId)).find((item) => item.enabled);

    if (!clip) {
      throw new BadRequestException('Upload a clip before previewing');
    }

    const previewStyle = { ...style, width: 640, height: 360 };
    const path = this.library.path(
      projectId,
      `preview/frame_${videoHash({ id: clip.id, style: previewStyle })}.jpg`,
    );

    if (!existsSync(path)) {
      await this.ffmpeg.renderMedia(path, [
        '-ss',
        String(Math.min(2, clip.durationSec / 2)),
        '-i',
        this.state.getArtifactPath(projectId, clip.filePath),
        '-vf',
        gradeFilter(previewStyle),
        '-frames:v',
        '1',
      ]);
    }

    return path;
  }
}
