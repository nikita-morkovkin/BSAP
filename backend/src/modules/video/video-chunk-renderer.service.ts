import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, promises as fs } from 'fs';
import { basename } from 'path';
import { FfmpegService } from '../audio/ffmpeg.service';
import { writeArtifact } from '../../utils/write-artifact.util';
import { videoProbeSchema } from './schemas';
import type { VideoPlan } from './types/video-plan.type';
import type { VideoStyleConfig } from './types/video-style.type';
import { encoderArgs } from './utils';
import { chunkSlices } from './utils/chunk-slices.util';
import { chunkFilter } from './utils/chunk-filter.util';
import { VideoLibraryService } from './video-library.service';

@Injectable()
export class VideoChunkRendererService {
  constructor(
    private readonly ffmpeg: FfmpegService,
    private readonly library: VideoLibraryService,
    private readonly config: ConfigService,
  ) {}

  public async render(
    projectId: string,
    plan: VideoPlan,
    style: VideoStyleConfig,
    signal: AbortSignal,
    progress: (stage: 'rendering_chunks' | 'stitching', value: number) => void,
    preview = false,
  ): Promise<string> {
    const destination = this.library.path(
      projectId,
      `cycle/master_cycle_${plan.planHash}.mp4`,
    );

    if (existsSync(destination)) {
      return destination;
    }

    const slices = chunkSlices(
      plan,
      style.fps,
      Number(this.config.get('VIDEO_CHUNK_SIZE') ?? 10),
    );
    const files: string[] = [];

    for (const [index, slice] of slices.entries()) {
      signal.throwIfAborted();

      const items = plan.items.slice(slice.start, slice.end);
      const path = this.library.path(
        projectId,
        `chunks/${plan.planHash}/chunk_${String(index).padStart(4, '0')}.mp4`,
      );

      if (!existsSync(path)) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await this.ffmpeg.renderMedia(
              path,
              [
                ...items.flatMap((item) => ['-threads', '1', '-i', item.path]),
                '-filter_complex',
                chunkFilter(
                  items,
                  { ...style, crossfadeSec: plan.crossfade },
                  slice.input,
                  slice.output,
                  !plan.loopWindow && index === slices.length - 1,
                ),
                '-map',
                '[out]',
                ...encoderArgs(style, preview),
                '-force_key_frames',
                '0',
              ],
              {
                signal,
                duration: slice.duration,
                onProgress: (value) =>
                  progress('rendering_chunks', (index + value) / slices.length),
              },
            );

            break;
          } catch (error) {
            signal.throwIfAborted();

            if (attempt === 1) {
              throw error;
            }
          }
        }
      }

      files.push(path);

      progress('rendering_chunks', (index + 1) / slices.length);
    }

    progress('stitching', 0);

    const list = this.library.path(
      projectId,
      `chunks/${plan.planHash}/concat.txt`,
    );

    await writeArtifact(
      list,
      files.map((file) => `file '${basename(file)}'`).join('\n') + '\n',
    );

    const stderr = await this.ffmpeg.renderMedia(
      destination,
      [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
      ],
      { signal },
    );
    const expected = slices.reduce((sum, slice) => sum + slice.duration, 0);
    const probe = videoProbeSchema.parse(
      await this.ffmpeg.probeMedia(destination),
    );

    if (
      Math.abs(Number(probe.format.duration) - expected) >
        slices.length / style.fps ||
      /non.monoton/i.test(stderr)
    ) {
      Logger.warn(
        'Video stream-copy stitch validation failed; re-encoding the bounded cycle',
        'Video',
      );

      await this.ffmpeg.renderMedia(
        destination,
        [
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          list,
          ...encoderArgs(style, preview),
        ],
        { signal, duration: expected },
      );

      const fallback = videoProbeSchema.parse(
        await this.ffmpeg.probeMedia(destination),
      );

      if (
        Math.abs(Number(fallback.format.duration) - expected) >
        slices.length / style.fps
      ) {
        await fs.rm(destination, { force: true });

        throw new Error('Cycle duration validation failed after fallback');
      }
    }

    if (this.config.get('VIDEO_DEBUG') === '1') {
      let position = 0;

      for (const [index, slice] of slices.entries()) {
        if (index > 0) {
          for (const [name, offset] of [
            ['before', -1 / style.fps],
            ['after', 0],
          ] as const) {
            await this.ffmpeg.renderMedia(
              this.library.path(
                projectId,
                `chunks/${plan.planHash}/debug/seam_${index}_${name}.jpg`,
              ),
              [
                '-ss',
                String(Math.max(0, position + offset)),
                '-i',
                destination,
                '-frames:v',
                '1',
              ],
              { signal },
            );
          }
        }

        position += slice.duration;
      }
    }

    progress('stitching', 1);

    return destination;
  }
}
