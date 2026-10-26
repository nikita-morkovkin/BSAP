import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { musicProbeSchema } from './schemas';

@Injectable()
export class MusicProbeService {
  constructor(private readonly config: ConfigService) {}

  public async validate(
    path: string,
    format: 'wav' | 'mp3' = 'wav',
  ): Promise<{ durationSeconds: number; sizeBytes: number }> {
    const stat = await fs.stat(path);
    const maximum = Number(
      this.config.get('MUSIC_MAX_UPLOAD_BYTES') ?? 536870912,
    );

    if (stat.size > maximum) {
      throw new PayloadTooLargeException(
        `Audio exceeds the ${maximum}-byte upload limit`,
      );
    }

    try {
      const handle = await fs.open(path, 'r');
      const header = Buffer.alloc(12);

      try {
        await handle.read(header, 0, header.length, 0);
      } finally {
        await handle.close();
      }

      if (
        format === 'wav' &&
        (header.toString('ascii', 8, 12) !== 'WAVE' ||
          !['RIFF', 'RF64'].includes(header.toString('ascii', 0, 4)) ||
          (header.toString('ascii', 0, 4) === 'RIFF' &&
            header.readUInt32LE(4) + 8 !== stat.size))
      ) {
        throw new Error('WAV header is invalid or the file is truncated');
      }

      const { execa } = await import('execa');
      const { stdout } = await execa(
        this.config.get<string>('FFPROBE_PATH') ?? 'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=format_name,duration:stream=codec_type',
          '-of',
          'json',
          path,
        ],
        { timeout: 30000 },
      );

      const audio = musicProbeSchema.parse(JSON.parse(stdout));

      const durationSeconds = Number(audio.format?.duration);
      const limit = Number(
        this.config.get('MUSIC_MAX_DURATION_SECONDS') ?? 14400,
      );

      if (
        audio.format?.format_name !== format ||
        !audio.streams?.length ||
        audio.streams.some((stream) => stream.codec_type !== 'audio') ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0 ||
        durationSeconds > limit
      ) {
        throw new Error(
          `Expected valid ${format.toUpperCase()} audio with duration between zero and ${limit} seconds`,
        );
      }

      // A container probe alone can accept damaged audio. Decode the entire source too.
      const decoded = await execa(
        this.config.get<string>('FFMPEG_PATH') ?? 'ffmpeg',
        ['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'],
        { timeout: 300000 },
      );

      if (decoded.stderr.trim()) {
        throw new Error('Audio contains damaged or truncated data');
      }

      return { durationSeconds, sizeBytes: stat.size };
    } catch {
      throw new UnsupportedMediaTypeException(
        `Cannot use this audio: expected intact ${format.toUpperCase()} audio, no video, and duration at most ${Number(this.config.get('MUSIC_MAX_DURATION_SECONDS') ?? 14400)} seconds. Check the file or configured FFmpeg/FFprobe tools.`,
      );
    }
  }
}
