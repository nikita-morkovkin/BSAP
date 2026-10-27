import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, dirname, extname, relative } from 'path';
import { writeArtifact } from '../../utils/write-artifact.util';
import { ProjectMusicService } from '../music/project-music.service';
import { StateManagerService } from '../state/state-manager.service';
import { MasterProjectQueueService } from './master-project-queue.service';
import { MetadataExporterService } from './metadata-exporter.service';

@Injectable()
export class FfmpegService {
  constructor(
    private readonly configService: ConfigService,
    private readonly stateManagerService: StateManagerService,
    private readonly masterProjectQueueService: MasterProjectQueueService,
    private readonly metadataExporterService: MetadataExporterService,
    private readonly projectMusicService: ProjectMusicService,
  ) {}

  public async assembleChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<void> {
    const state = await this.stateManagerService.getState(projectId);
    const chapter = state.chapters[String(chapterNumber)];

    if (
      !chapter ||
      chapter.chunks.length === 0 ||
      chapter.chunks.some((chunk) => chunk.status !== 'COMPLETED')
    ) {
      throw new Error(
        `Chapter ${chapterNumber} has no completed chunks to assemble`,
      );
    }

    const destination = this.stateManagerService.getArtifactPath(
      projectId,
      chapter.audioFilePath,
    );
    const listPath = this.stateManagerService.getArtifactPath(
      projectId,
      `chapters/ch_${String(chapterNumber).padStart(2, '0')}_concat.txt`,
    );
    const files: string[] = [];

    for (const chunk of [...chapter.chunks].sort(
      (left, right) => left.index - right.index,
    )) {
      const source = this.stateManagerService.getArtifactPath(
        projectId,
        chunk.filePath,
      );
      const duration = await this.getDurationSeconds(source);
      const normalized = this.stateManagerService.getArtifactPath(
        projectId,
        `chunks/normalized/${basename(chunk.filePath)}`,
      );

      await this.render(normalized, [
        '-i',
        source,
        '-af',
        `afade=t=in:st=0:d=0.015,afade=t=out:st=${Math.max(0, duration - 0.025)}:d=0.025`,
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
      ]);

      files.push(normalized);

      if (chunk.pauseAfterMs > 0) {
        files.push(await this.ensureSilence(projectId, chunk.pauseAfterMs));
      }
    }

    await this.concatenate(listPath, files, destination);

    const durationMs = Math.round(
      (await this.getDurationSeconds(destination)) * 1000,
    );
    const updated = await this.stateManagerService.markChapterAudioCompleted(
      projectId,
      chapterNumber,
      durationMs,
    );

    if (
      Object.values(updated.chapters).every(
        (candidate) =>
          candidate.ttsStatus === 'COMPLETED' && candidate.durationMs > 0,
      )
    ) {
      await this.masterProjectQueueService.enqueueProject(projectId);
    }
  }

  public async buildAmbientBed(projectId: string): Promise<string | null> {
    const state = await this.stateManagerService.getState(projectId);
    const config = state.profile.masteringConfig;
    const tracks = await this.projectMusicService.paths(projectId);

    if (tracks.length === 0) {
      return null;
    }

    const inputs: string[] = [];
    const filters: string[] = [];
    const fade = config.ambientCrossfadeSeconds;
    let duration = 0;

    for (const [index, path] of tracks.entries()) {
      const length = Math.max(
        (await this.getDurationSeconds(path)) / config.ambientSpeed,
        fade * 2 + 1,
      );

      inputs.push('-stream_loop', '-1', '-i', path);
      filters.push(
        `[${index}:a]atempo=${config.ambientSpeed},aresample=44100,aformat=channel_layouts=stereo,atrim=duration=${length},asetpts=PTS-STARTPTS[a${index}]`,
      );

      duration += length;

      if (index > 0) {
        const previous = index === 1 ? 'a0' : `mix${index - 1}`;

        filters.push(
          fade > 0
            ? `[${previous}][a${index}]acrossfade=d=${fade}[mix${index}]`
            : `[${previous}][a${index}]concat=n=2:v=0:a=1[mix${index}]`,
        );

        duration -= fade;
      }
    }

    const mixed = tracks.length === 1 ? 'a0' : `mix${tracks.length - 1}`;

    if (fade > 0) {
      // Rotate the cycle so its tail/head overlap is inside the file, not at its loop boundary.
      filters.push(
        `[${mixed}]asplit=3[body][tail][head]`,
        `[body]atrim=start=${fade}:end=${duration - fade},asetpts=PTS-STARTPTS[middle]`,
        `[tail]atrim=start=${duration - fade},asetpts=PTS-STARTPTS[end]`,
        `[head]atrim=end=${fade},asetpts=PTS-STARTPTS[start]`,
        `[end][start]acrossfade=d=${fade}[seam]`,
        '[middle][seam]concat=n=2:v=0:a=1[out]',
      );
    } else {
      filters.push(`[${mixed}]anull[out]`);
    }

    const destination = this.stateManagerService.getArtifactPath(
      projectId,
      'output/ambient_cycle.wav',
    );

    await this.render(destination, [
      ...inputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[out]',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
    ]);

    return destination;
  }

  public async masterProject(projectId: string): Promise<void> {
    const state = await this.projectMusicService.initialize(projectId);
    const selectionRevision = state.music!.revision;
    const chapters = Object.values(state.chapters).sort(
      (left, right) => left.chapterNumber - right.chapterNumber,
    );

    if (
      chapters.length === 0 ||
      chapters.some(
        (chapter) =>
          chapter.ttsStatus !== 'COMPLETED' || chapter.durationMs <= 0,
      )
    ) {
      throw new Error('All chapters must be assembled before mastering');
    }

    await this.stateManagerService.updateState(projectId, (current) => {
      current.status = 'MASTERING';
      current.outputFiles = {};

      delete current.error;
    });

    const artifact = (path: string): string =>
      this.stateManagerService.getArtifactPath(projectId, path);
    const voice = artifact('output/voice_raw_full.wav');

    await this.concatenate(
      artifact('output/voice_concat.txt'),
      chapters.map((chapter) => artifact(chapter.audioFilePath)),
      voice,
    );

    await this.stateManagerService.updateState(projectId, (current) => {
      current.outputFiles.narration = 'output/voice_raw_full.wav';
    });

    const ambient = await this.buildAmbientBed(projectId);
    const duration = await this.getDurationSeconds(voice);
    const config = state.profile.masteringConfig;
    const fadeDuration = Math.min(
      config.fadeOutSeconds,
      duration + config.paddingSeconds,
    );
    const masterDuration = duration + config.paddingSeconds;

    if (ambient) {
      await this.render(artifact('output/background_music.wav'), [
        '-stream_loop',
        '-1',
        '-i',
        ambient,
        '-af',
        `volume=${config.ambientVolumeDb}dB,atrim=duration=${masterDuration},afade=t=out:st=${masterDuration - fadeDuration}:d=${fadeDuration}`,
        '-ar',
        '44100',
        '-ac',
        '2',
        '-c:a',
        'pcm_s16le',
      ]);
    }

    const filter = [
      `[0:a]highpass=f=${config.highpassHz},equalizer=f=${config.warmthFrequencyHz}:t=q:w=1.2:g=${config.warmthGainDb},deesser=i=${config.deesserIntensity}:m=0.5:f=0.5:s=o,lowpass=f=${config.lowpassHz},acompressor=threshold=${config.compressorThresholdDb}dB:ratio=${config.compressorRatio}:attack=20:release=250,loudnorm=I=${config.loudnessLufs}:TP=${config.truePeakDb}:LRA=${config.loudnessRange},apad=pad_dur=${config.paddingSeconds}[voice]`,
      ...(ambient ? [`[1:a]volume=${config.ambientVolumeDb}dB[ambient]`] : []),
      `${ambient ? '[voice][ambient]amix=inputs=2:duration=first:dropout_transition=0,' : '[voice]'}afade=t=out:st=${duration + config.paddingSeconds - fadeDuration}:d=${fadeDuration}[out]`,
    ].join(';');

    await this.render(artifact('output/master_final.wav'), [
      '-i',
      voice,
      ...(ambient ? ['-stream_loop', '-1', '-i', ambient] : []),
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
    ]);
    await this.render(artifact('output/master_final.flac'), [
      '-i',
      artifact('output/master_final.wav'),
      '-c:a',
      'flac',
      '-sample_fmt',
      's16',
    ]);
    await this.metadataExporterService.export(projectId);
    await writeArtifact(
      artifact('output/music_manifest.json'),
      JSON.stringify(state.music, null, 2),
    );
    await this.stateManagerService.updateState(projectId, (current) => {
      if (current.music?.revision !== selectionRevision) {
        throw new Error(
          'Soundtrack revision changed during mastering; outputs were not committed',
        );
      }

      current.outputFiles = {
        narration: 'output/voice_raw_full.wav',
        ...(ambient ? { backgroundMusic: 'output/background_music.wav' } : {}),
        wav: 'output/master_final.wav',
        flac: 'output/master_final.flac',
        timestamps: 'output/youtube_timestamps.txt',
        markers: 'output/timeline_markers.csv',
      };
      current.status = 'COMPLETED';
      current.mixRevision = selectionRevision;
      current.mixNeedsRebuild = false;

      delete current.error;
    });
  }

  public async getDurationSeconds(path: string): Promise<number> {
    const { execa } = await import('execa');
    const { stdout } = await execa(
      this.configService.get<string>('FFPROBE_PATH') ?? 'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        path,
      ],
      { timeout: 30000 },
    );
    const duration = Number(stdout.trim());

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid audio duration: ${path}`);
    }

    return duration;
  }

  private async ensureSilence(
    projectId: string,
    milliseconds: number,
  ): Promise<string> {
    const destination = this.stateManagerService.getArtifactPath(
      projectId,
      `chunks/silence/silence_${milliseconds}.wav`,
    );

    try {
      const duration = await this.getDurationSeconds(destination);

      if (Math.abs(duration - milliseconds / 1000) < 1 / 24000) {
        return destination;
      }
    } catch {
      // Missing or interrupted cache entries are regenerated atomically.
    }

    await this.render(destination, [
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=24000:cl=mono',
      '-t',
      String(milliseconds / 1000),
      '-ar',
      '24000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
    ]);

    return destination;
  }

  private async concatenate(
    listPath: string,
    files: string[],
    destination: string,
  ): Promise<void> {
    const contents = files
      .map((file) => {
        const path = relative(dirname(listPath), file)
          .replace(/\\/g, '/')
          .replace(/'/g, "'\\''");

        return `file '${path}'`;
      })
      .join('\n');

    await fs.mkdir(dirname(listPath), { recursive: true });
    await writeArtifact(listPath, `${contents}\n`);
    await this.render(destination, [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
    ]);
  }

  private async render(destination: string, args: string[]): Promise<void> {
    const { execa } = await import('execa');
    const extension = extname(destination);
    const temporary = `${destination}.${randomUUID()}${extension}`;

    await fs.mkdir(dirname(destination), { recursive: true });

    try {
      await execa(
        this.configService.get<string>('FFMPEG_PATH') ?? 'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-y',
          ...args,
          ...(extension === '.wav' ? ['-rf64', 'auto'] : []),
          temporary,
        ],
        { stdout: 'ignore', stderr: 'pipe', maxBuffer: 1024 * 1024 },
      );
      await this.getDurationSeconds(temporary);
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
}
