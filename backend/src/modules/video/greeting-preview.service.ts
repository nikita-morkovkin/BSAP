import { BadRequestException, Injectable } from '@nestjs/common';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { GreetingRendererService } from './greeting-renderer.service';
import { encoderArgs, videoHash } from './utils';
import { greetingCompositeFilter } from './utils/greeting-composite-filter.util';

@Injectable()
export class GreetingPreviewService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
    private readonly renderer: GreetingRendererService,
  ) {}

  public async build(projectId: string, signal: AbortSignal): Promise<string> {
    const video = (await this.state.getState(projectId)).video;

    if (!video?.cycle || !video.greeting || !video.greetingAudio) {
      throw new BadRequestException(
        'Build a cycle and greeting audio before previewing',
      );
    }

    const style = { ...video.style, width: 640, height: 360 };
    const character = await this.renderer.render(projectId, signal, style);
    const duration = Math.min(40, Math.max(20, character.duration));
    const path = `video/preview/greeting_${videoHash({ video, character })}.mp4`;
    const delay = Math.round(video.greetingAudio.startSec * 1000);
    const encoder = encoderArgs(style, true);
    const silent = encoder.indexOf('-an');

    encoder.splice(silent, 1);

    await this.ffmpeg.renderMedia(
      this.state.getArtifactPath(projectId, path),
      [
        '-stream_loop',
        '-1',
        '-i',
        this.state.getArtifactPath(projectId, video.cycle.path),
        '-i',
        character.path,
        '-i',
        this.state.getArtifactPath(projectId, video.greetingAudio.path),
        '-filter_complex',
        `[0:v]scale=640:360[base];${greetingCompositeFilter(video.greeting, style, character.duration).replace('[0:v]', '[base]')};[2:a]adelay=${delay}:all=1,apad[audio]`,
        '-map',
        '[out]',
        '-map',
        '[audio]',
        '-t',
        String(duration),
        ...encoder,
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      ],
      { signal, duration },
    );
    await this.state.updateState(projectId, (current) => {
      if (current.video) {
        current.video.greetingPreview = path;
      }
    });

    return path;
  }
}
