import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { StateManagerService } from '../state/state-manager.service';
import { FfmpegService } from '../audio/ffmpeg.service';
import { videoProbeSchema } from './schemas';
import { quantize, videoHash } from './utils';

@Injectable()
export class VideoFullService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  public async build(
    projectId: string,
    requested: number | undefined,
    signal: AbortSignal,
    onProgress: (value: number) => void,
  ): Promise<string> {
    const state = await this.state.getState(projectId);
    const cycle = state.video?.cycle;
    const audio = await this.ffmpeg.getFinalAudioInfo(projectId);
    const duration = requested ?? audio?.duration;

    if (
      !cycle ||
      !duration ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 86400
    ) {
      throw new BadRequestException(
        'Build a video loop and provide a duration or completed audio',
      );
    }

    if (!cycle.loop && duration > cycle.duration + 1 / cycle.fps) {
      throw new BadRequestException(
        'Rebuild as a seamless looping cycle before extending this timeline',
      );
    }

    const target = quantize(duration, cycle.fps);
    const path = `video/full/${videoHash({ cycle: cycle.planHash, target })}.mp4`;
    const destination = this.state.getArtifactPath(projectId, path);

    if (!existsSync(destination)) {
      await this.ffmpeg.renderMedia(
        destination,
        [
          ...(cycle.loop ? ['-stream_loop', '-1'] : []),
          '-i',
          this.state.getArtifactPath(projectId, cycle.path),
          '-t',
          String(target),
          '-map',
          '0:v:0',
          '-an',
          '-c:v',
          'copy',
          '-movflags',
          '+faststart',
        ],
        { signal, duration: target, onProgress },
      );

      const probe = videoProbeSchema.parse(
        await this.ffmpeg.probeMedia(destination),
      );

      if (
        Math.abs(Number(probe.format.duration) - target) >
        1 / cycle.fps + 0.001
      ) {
        await fs.rm(destination, { force: true });

        throw new Error(
          `Video-only export duration ${probe.format.duration} differs from ${target} by more than one frame`,
        );
      }
    }

    signal.throwIfAborted();

    await this.state.updateState(projectId, (current) => {
      if (current.video?.cycle?.planHash !== cycle.planHash) {
        throw new Error('Cycle changed during export');
      }

      current.video.full = {
        path,
        cycleHash: cycle.planHash,
        durationSec: target,
      };
    });

    return path;
  }
}
