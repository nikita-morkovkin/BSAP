import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { greetingSchema } from './schemas/greeting.schema';
import { videoHash } from './utils';
import { analyzeVad } from './utils/analyze-vad.util';

@Injectable()
export class GreetingVadService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  public async analyze(projectId: string) {
    const state = await this.state.getState(projectId);
    const audio = state.video?.greetingAudio;
    const config = state.video?.greeting ?? greetingSchema.parse({});

    if (!audio) {
      throw new BadRequestException('Generate greeting audio first');
    }

    const path = this.state.getArtifactPath(
      projectId,
      `video/character/pcm_${videoHash(audio)}.wav`,
    );

    await this.ffmpeg.renderMedia(path, [
      '-i',
      this.state.getArtifactPath(projectId, audio.path),
      '-t',
      '120',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
    ]);

    const wav = await fs.readFile(path);
    let offset = 12;
    let samples = new Int16Array();

    while (offset + 8 <= wav.length) {
      const length = wav.readUInt32LE(offset + 4);

      if (wav.toString('ascii', offset, offset + 4) === 'data') {
        const count = Math.floor(Math.min(length, wav.length - offset - 8) / 2);

        samples = new Int16Array(count);

        for (let index = 0; index < count; index += 1) {
          samples[index] = wav.readInt16LE(offset + 8 + index * 2);
        }

        break;
      }

      offset += 8 + length + (length % 2);
    }

    return {
      ...analyzeVad(samples, 16000, config.vad, state.video?.style.fps ?? 30),
      startSec: audio.startSec,
      endSec: audio.endSec,
    };
  }
}
