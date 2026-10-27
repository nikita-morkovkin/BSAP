import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { dirname, relative } from 'path';
import { writeArtifact } from '../../utils/write-artifact.util';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { GreetingRendererService } from './greeting-renderer.service';
import { encoderArgs, videoHash } from './utils';
import { greetingCompositeFilter } from './utils/greeting-composite-filter.util';

@Injectable()
export class GreetingCompositorService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
    private readonly renderer: GreetingRendererService,
  ) {}

  public async assemble(
    projectId: string,
    destination: string,
    duration: number,
    signal: AbortSignal,
    onProgress: (value: number) => void,
  ): Promise<void> {
    const state = await this.state.getState(projectId);
    const video = state.video;

    if (!video?.cycle || !video.greeting?.enabled) {
      throw new BadRequestException(
        'A cycle and enabled greeting are required',
      );
    }

    const character = await this.renderer.render(projectId, signal);
    const cut =
      Math.ceil(
        (character.duration +
          (video.greeting.placement === 'intro_fullscreen'
            ? video.greeting.crossfadeSec
            : 0)) /
          2,
      ) * 2;

    if (cut >= video.cycle.duration) {
      throw new BadRequestException(
        'Build a cycle longer than the greeting head',
      );
    }

    const cycle = this.state.getArtifactPath(projectId, video.cycle.path);
    const head = this.state.getArtifactPath(
      projectId,
      `video/character/head_${videoHash({ cycle: video.cycle.planHash, character: character.path, config: video.greeting, cut })}.mp4`,
    );

    if (!existsSync(head)) {
      await this.ffmpeg.renderMedia(
        head,
        [
          '-i',
          cycle,
          '-i',
          character.path,
          '-filter_complex',
          greetingCompositeFilter(
            video.greeting,
            video.style,
            character.duration,
          ),
          '-map',
          '[out]',
          '-t',
          String(cut),
          ...encoderArgs(video.style),
          '-force_key_frames',
          'expr:gte(t,n_forced*2)',
        ],
        { signal, duration: cut },
      );
    }

    const files = [
      { path: head, inpoint: 0 },
      { path: cycle, inpoint: cut },
    ];

    for (
      let remaining = duration - video.cycle.duration;
      remaining > 0;
      remaining -= video.cycle.duration
    ) {
      files.push({ path: cycle, inpoint: 0 });
    }

    const list = `${destination}.concat.txt`;
    const entries = files.map((file) => {
      const path = relative(dirname(list), file.path)
        .replace(/\\/g, '/')
        .replace(/'/g, "'\\''");

      return `file '${path}'${file.inpoint ? `\ninpoint ${file.inpoint}` : ''}`;
    });

    await fs.mkdir(dirname(list), { recursive: true });
    await writeArtifact(list, `${entries.join('\n')}\n`);
    await this.ffmpeg.renderMedia(
      destination,
      [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-t',
        String(duration),
        '-an',
        '-c:v',
        'copy',
        '-movflags',
        '+faststart',
      ],
      { signal, duration, onProgress },
    );
  }
}
