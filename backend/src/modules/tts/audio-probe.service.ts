import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { audioProbeSchema } from './schemas';

@Injectable()
export class AudioProbeService {
  private readonly ffprobePath: string;

  constructor(private readonly configService: ConfigService) {
    this.ffprobePath = this.configService.getOrThrow<string>('FFPROBE_PATH');
  }

  public async getDurationMs(filePath: string): Promise<number> {
    const { stdout } = await promisify(execFile)(
      this.ffprobePath,
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_type,duration:format=format_name,duration',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true },
    );

    const result = audioProbeSchema.parse(JSON.parse(stdout));
    const audio = result.streams.find(
      (stream) => stream.codec_type === 'audio',
    );

    const durationMs = Number(audio?.duration ?? result.format.duration) * 1000;

    if (
      !audio ||
      !Number.isFinite(durationMs) ||
      durationMs <= 150 ||
      !Number.isSafeInteger(Math.round(durationMs))
    ) {
      throw new Error('WAV must contain an audio stream longer than 150ms');
    }

    // State stores integer milliseconds; preserve ffprobe precision until rounding.
    return Math.round(durationMs);
  }
}
