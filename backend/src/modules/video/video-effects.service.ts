import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { StateManagerService } from '../state/state-manager.service';
import { videoStyleSchema } from './schemas';
import { effectSchema } from './schemas/effect.schema';
import type { EffectDef } from './types/effect.type';
import type { VideoUpload } from './types/video-upload.type';
import { effectiveEffects } from './utils/effective-effects.util';
import { VideoLibraryService } from './video-library.service';

@Injectable()
export class VideoEffectsService {
  constructor(
    private readonly state: StateManagerService,
    private readonly library: VideoLibraryService,
  ) {}

  public async upload(id: string, file: VideoUpload): Promise<EffectDef> {
    const clip = await this.library.upload(id, file, 'effects');

    if (clip.durationSec > 600) {
      await fs.rm(this.library.path(id, `effects/${clip.id}`), {
        recursive: true,
        force: true,
      });

      throw new BadRequestException(
        'Overlay duration must not exceed ten minutes',
      );
    }

    const effect = effectSchema.parse({
      id: clip.id,
      name: clip.originalName,
      path: clip.filePath,
      thumbPath: clip.thumbPath,
      durationSec: clip.durationSec,
      hasAlpha: Boolean(clip.hasAlpha),
      blend: clip.hasAlpha ? 'overlay_alpha' : 'screen',
    });

    await this.state.updateState(id, (current) => {
      current.video ??= {
        style: videoStyleSchema.parse({}),
        effects: [],
        effectAssignments: {},
      };

      current.video.effects ??= [];

      if (!current.video.effects.some((item) => item.id === effect.id)) {
        current.video.effects.push(effect);
      }
    });

    return effect;
  }

  public async selected(id: string, clipId: string): Promise<EffectDef[]> {
    const video = (await this.state.getState(id)).video;

    return effectiveEffects(
      clipId,
      video?.effects ?? [],
      video?.effectAssignments ?? {},
      video?.effectRules,
    );
  }

  public async assertIdle(id: string): Promise<void> {
    const job = (await this.state.getState(id)).video?.job;

    if (job && !['done', 'failed', 'cancelled'].includes(job.stage)) {
      throw new ConflictException('Wait for the current video job');
    }
  }
}
