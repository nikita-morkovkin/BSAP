import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { FfmpegService } from '../audio/ffmpeg.service';
import { MasterProjectQueueService } from '../audio/master-project-queue.service';
import { StateManagerService } from '../state/state-manager.service';
import { TextNormalizerService } from '../text/text-normalizer.service';
import { KokoroTtsAdapter } from '../tts/kokoro-tts.adapter';
import { greetingSchema } from './schemas/greeting.schema';
import { videoHash } from './utils';
import { VideoLibraryService } from './video-library.service';

@Injectable()
export class GreetingAudioService {
  constructor(
    private readonly state: StateManagerService,
    private readonly tts: KokoroTtsAdapter,
    private readonly normalizer: TextNormalizerService,
    private readonly ffmpeg: FfmpegService,
    private readonly mastering: MasterProjectQueueService,
    private readonly library: VideoLibraryService,
  ) {}

  public async regenerate(
    projectId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const state = await this.state.getState(projectId);
    const config = state.video?.greeting ?? greetingSchema.parse({});

    if (['MASTERING', 'SYNTHESIZING_AUDIO'].includes(state.status)) {
      throw new BadRequestException(
        'Wait for audio production to finish before regenerating the greeting',
      );
    }

    const native = config.lipSyncMode === 'native_veo_audio';
    const clip =
      native && config.nativeClipId
        ? await this.library.get(projectId, config.nativeClipId, 'character')
        : undefined;

    if ((!native && !config.text) || (native && !clip?.hasAudio)) {
      throw new BadRequestException(
        'Enter greeting text, or select a native Veo clip that contains audio',
      );
    }

    const hash = native
      ? videoHash({ nativeClipId: config.nativeClipId })
      : videoHash({
          text: config.text,
          voice: state.profile.ttsVoice,
          speed: state.profile.ttsSpeed,
        });
    const relative = `video/character/audio_${hash}.wav`;
    const path = this.state.getArtifactPath(projectId, relative);

    if (!existsSync(path)) {
      const temporary = `${path}.tmp.wav`;
      const text = this.normalizer
        .normalize(config.text)
        .map((block) => block.text)
        .join(' ');

      try {
        if (native && clip) {
          const mastering = state.profile.masteringConfig;

          await this.ffmpeg.renderMedia(
            temporary,
            [
              '-i',
              this.state.getArtifactPath(projectId, clip.filePath),
              '-vn',
              '-af',
              `loudnorm=I=${mastering.loudnessLufs}:TP=${mastering.truePeakDb}:LRA=${mastering.loudnessRange}`,
              '-ar',
              '24000',
              '-ac',
              '1',
              '-c:a',
              'pcm_s16le',
            ],
            { signal },
          );
        } else {
          await this.tts.synthesize(text, temporary, state.profile);
        }
        signal.throwIfAborted();

        await this.ffmpeg.getDurationSeconds(temporary);
        await fs.rename(temporary, path);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    }

    const duration = await this.ffmpeg.getDurationSeconds(path);

    await this.state.updateState(projectId, (current) => {
      if (!current.video || current.video.greeting?.text !== config.text) {
        throw new Error('Greeting changed during synthesis');
      }

      current.video.greetingAudio = {
        path: relative,
        hash,
        startSec: config.leadInSec,
        endSec: config.leadInSec + duration,
      };
      current.mixNeedsRebuild = true;
    });

    if (
      Object.values(state.chapters).length &&
      Object.values(state.chapters).every(
        (chapter) =>
          chapter.ttsStatus === 'COMPLETED' && chapter.durationMs > 0,
      )
    ) {
      await this.mastering.enqueueProject(projectId);
    }
  }
}
