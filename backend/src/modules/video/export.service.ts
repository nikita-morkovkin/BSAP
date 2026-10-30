import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { extname } from 'path';
import { audioInputHash } from '../../utils/audio-input-hash.util';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { videoProbeSchema } from './schemas';
import type { ExportArtifact } from './types/export-artifact.type';
import type { ExportKind } from './types/export-kind.type';
import { videoHash } from './utils';
import { VideoInputsService } from './video-inputs.service';

@Injectable()
export class ExportService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
    private readonly inputs: VideoInputsService,
  ) {}

  private readonly builds = new Map<string, Promise<string>>();
  private readonly durations = new Map<string, number>();

  public async list(projectId: string): Promise<ExportArtifact[]> {
    const state = await this.state.getState(projectId);
    const cycleHash = await this.inputs.cycle(projectId);
    const cycleStale = Boolean(
      state.video?.cycle?.inputHash &&
      state.video.cycle.inputHash !== cycleHash,
    );
    const paths: Record<ExportKind, string | undefined> = {
      narration: state.outputFiles.narration,
      background_music: state.outputFiles.backgroundMusic,
      mixed_audio: state.outputFiles.flac ?? state.outputFiles.wav,
      video_loop: state.video?.cycle?.path,
      video_full: state.video?.full?.path,
      final_mp4: state.video?.output,
    };

    const finalAudio = state.outputFiles.flac ?? state.outputFiles.wav;

    const audioStat = finalAudio
      ? await fs
          .stat(this.state.getArtifactPath(projectId, finalAudio))
          .catch(() => null)
      : null;

    const audioRevision = audioStat
      ? `${audioStat.size}:${audioStat.mtimeMs}`
      : undefined;

    const audioStale = Boolean(
      state.mixNeedsRebuild ||
      (state.audioInputHash &&
        state.audioInputHash !== audioInputHash(state)) ||
      (state.mixRevision !== undefined &&
        state.mixRevision !== state.music?.revision),
    );

    const artifacts: ExportArtifact[] = [];

    for (const kind of Object.keys(paths) as ExportKind[]) {
      const path = paths[kind];
      const absolute = path
        ? this.state.getArtifactPath(projectId, path)
        : undefined;

      const stat = absolute ? await fs.stat(absolute).catch(() => null) : null;
      const audio = ['narration', 'background_music', 'mixed_audio'].includes(
        kind,
      );

      const stale = Boolean(
        (audio && audioStale) ||
        (['video_loop', 'video_full', 'final_mp4'].includes(kind) &&
          cycleStale) ||
        (kind === 'video_full' &&
          state.video?.full?.cycleHash !== state.video?.cycle?.planHash) ||
        (kind === 'final_mp4' &&
          (audioStale ||
            state.video?.outputHash !== audioRevision ||
            state.video?.outputCycleHash !== state.video?.cycle?.planHash)),
      );
      const durationKey = `${absolute}:${stat?.size}:${stat?.mtimeMs}`;
      let durationSec = this.durations.get(durationKey);

      if (stat && absolute && durationSec === undefined) {
        const probe = videoProbeSchema.parse(
          await this.ffmpeg.probeMedia(absolute),
        );

        durationSec = Number(probe.format.duration);

        if (this.durations.size > 500) {
          this.durations.clear();
        }

        this.durations.set(durationKey, durationSec);
      }

      artifacts.push({
        kind,
        available: Boolean(stat),
        stale: Boolean(
          stale ||
          (audio && audioStale) ||
          (kind === 'final_mp4' &&
            state.video?.outputHash &&
            state.video.outputHash !== audioRevision),
        ),
        buildable:
          kind === 'video_full'
            ? Boolean(state.video?.cycle)
            : kind === 'final_mp4'
              ? Boolean(
                  state.video?.cycle &&
                  !state.mixNeedsRebuild &&
                  (state.outputFiles.flac || state.outputFiles.wav),
                )
              : false,
        path: stat ? path : undefined,
        sizeBytes: stat?.size,
        durationSec,
        container: path ? extname(path).slice(1) : undefined,
        updatedAt: stat?.mtime.toISOString(),
        formats: audio ? ['flac', 'wav', 'mp3', 'm4a'] : ['mp4'],
      });
    }

    return artifacts;
  }

  public async resolve(
    projectId: string,
    kind: ExportKind,
    format?: string,
    applyMixGain = false,
  ): Promise<string> {
    const key = `${projectId}:${kind}:${format}:${applyMixGain}`;
    const pending = this.builds.get(key);

    if (pending) {
      return pending;
    }

    const build = this.convert(projectId, kind, format, applyMixGain);

    this.builds.set(key, build);

    try {
      return await build;
    } finally {
      this.builds.delete(key);
    }
  }

  private async convert(
    projectId: string,
    kind: ExportKind,
    format: string | undefined,
    applyMixGain: boolean,
  ): Promise<string> {
    const artifact = (await this.list(projectId)).find(
      (entry) => entry.kind === kind,
    );

    if (!artifact?.available || !artifact.path) {
      throw new NotFoundException('Artifact is not built');
    }

    if (artifact.stale) {
      throw new BadRequestException(
        'Artifact is outdated; rebuild before downloading',
      );
    }

    const audio = ['narration', 'background_music', 'mixed_audio'].includes(
      kind,
    );
    const extension = format ?? (audio ? 'flac' : 'mp4');

    if (!artifact.formats.includes(extension)) {
      throw new BadRequestException('Unsupported export format');
    }

    let source = this.state.getArtifactPath(projectId, artifact.path);

    if (
      !audio ||
      (kind === 'mixed_audio' && extension === artifact.container)
    ) {
      return source;
    }

    const state = await this.state.getState(projectId);
    const config = state.profile.masteringConfig;
    const master = state.outputFiles.flac ?? state.outputFiles.wav;
    const duration = master
      ? await this.ffmpeg.getDurationSeconds(
          this.state.getArtifactPath(projectId, master),
        )
      : artifact.durationSec;
    const hash = videoHash({
      source: artifact.updatedAt,
      size: artifact.sizeBytes,
      duration,
      applyMixGain,
      revision: state.mixRevision,
      config,
    });
    const destination = this.state.getArtifactPath(
      projectId,
      `exports/${kind}/${hash}.${extension}`,
    );

    if (!existsSync(destination)) {
      const filters: string[] = [];

      if (kind === 'background_music' && !applyMixGain && duration) {
        source = this.state.getArtifactPath(
          projectId,
          'output/ambient_cycle.wav',
        );

        if (!existsSync(source)) {
          throw new BadRequestException(
            'Rebuild the mix to create a clean unity-gain ambient cycle',
          );
        }

        const fade = Math.min(config.fadeOutSeconds, duration);

        filters.push(
          `atrim=duration=${duration}${fade > 0 ? `,afade=t=out:st=${duration - fade}:d=${fade}` : ''}`,
        );
      }

      if (kind === 'narration' && duration) {
        filters.push(`apad,atrim=duration=${duration}`);
      }

      const codecs: Record<string, string[]> = {
        flac: ['-c:a', 'flac'],
        wav: ['-c:a', 'pcm_s24le', '-rf64', 'auto'],
        mp3: ['-c:a', 'libmp3lame', '-b:a', '320k'],
        m4a: ['-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart'],
      };

      await this.ffmpeg.renderMedia(destination, [
        ...(kind === 'background_music' && !applyMixGain
          ? ['-stream_loop', '-1']
          : []),
        '-i',
        source,
        '-vn',
        ...(filters.length ? ['-af', filters.join(',')] : []),
        ...codecs[extension],
      ]);
    }

    return destination;
  }
}
