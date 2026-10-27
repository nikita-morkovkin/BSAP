import { Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { videoProbeSchema } from './schemas';
import { videoHash } from './utils';
import { VideoLibraryService } from './video-library.service';
import { VideoFullService } from './video-full.service';
import { VideoInputsService } from './video-inputs.service';

@Injectable()
export class VideoFinalMuxService {
  constructor(
    private readonly ffmpeg: FfmpegService,
    private readonly state: StateManagerService,
    private readonly library: VideoLibraryService,
    private readonly full: VideoFullService,
    private readonly inputs: VideoInputsService,
  ) {}

  public async mux(
    projectId: string,
    signal: AbortSignal,
    onProgress: (value: number) => void,
  ): Promise<string | null> {
    const state = await this.state.getState(projectId);
    const cycle = state.video?.cycle;
    const audio = await this.ffmpeg.getFinalAudioInfo(projectId);

    if (!cycle || !audio) {
      return null;
    }

    if (!cycle.loop && cycle.duration + 1 / cycle.fps < audio.duration) {
      throw new Error(
        'Audio is now longer than the non-looping timeline; rebuild the video',
      );
    }

    const greetingInputs = state.video?.greeting?.enabled
      ? await this.inputs.greeting(projectId)
      : undefined;
    const hash = videoHash({
      greetingInputs,
      greeting: state.video?.greeting?.enabled
        ? state.video.greeting
        : undefined,
      greetingAudio: state.video?.greeting?.enabled
        ? state.video.greetingAudio
        : undefined,
      cycle: cycle.planHash,
      audio: audio.revision,
      duration: audio.duration,
    });
    const relative = `video/final/final_${hash}.mp4`;
    const path = this.state.getArtifactPath(projectId, relative);

    if (!existsSync(path)) {
      const disk = await fs.statfs(this.state.getProjectDirectory(projectId));
      const cycleSize = (
        await fs.stat(this.state.getArtifactPath(projectId, cycle.path))
      ).size;
      const estimatedBytes =
        (cycleSize / cycle.duration) * audio.duration + audio.duration * 50000;

      if (disk.bavail * disk.bsize < estimatedBytes * 1.1) {
        throw new Error(
          `Insufficient disk space for final MP4 (approximately ${Math.ceil(estimatedBytes / 1073741824)} GiB required)`,
        );
      }

      const audioProbe = videoProbeSchema.parse(
        await this.ffmpeg.probeMedia(audio.path),
      );
      const aac = audioProbe.streams.some(
        (stream) =>
          stream.codec_type === 'audio' && stream.codec_name === 'aac',
      );

      const greetingPath = state.video?.greeting?.enabled
        ? await this.full.build(
            projectId,
            audio.duration,
            signal,
            onProgress,
            true,
          )
        : undefined;

      await this.ffmpeg.renderMedia(
        path,
        [
          ...(cycle.loop && !greetingPath ? ['-stream_loop', '-1'] : []),
          '-i',
          this.state.getArtifactPath(projectId, greetingPath ?? cycle.path),
          '-i',
          audio.path,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          '-c:a',
          aac ? 'copy' : 'aac',
          ...(aac ? [] : ['-b:a', '320k']),
          '-t',
          String(audio.duration),
          '-movflags',
          '+faststart',
        ],
        { signal, duration: audio.duration, onProgress },
      );

      const probe = videoProbeSchema.parse(await this.ffmpeg.probeMedia(path));

      if (
        Math.abs(Number(probe.format.duration) - audio.duration) >
        1 / cycle.fps + 0.025
      ) {
        await fs.rm(path, { force: true });

        throw new Error(
          `Final video duration ${probe.format.duration} does not match audio ${audio.duration} within one frame plus AAC packet tolerance`,
        );
      }
    }

    signal.throwIfAborted();

    await this.state.updateState(projectId, (current) => {
      if (current.video) {
        current.video.output = relative;
        current.video.outputHash = audio.revision;
        current.video.outputCycleHash = cycle.planHash;
        current.video.outputGreetingHash = greetingInputs;
      }
    });

    return relative;
  }
}
