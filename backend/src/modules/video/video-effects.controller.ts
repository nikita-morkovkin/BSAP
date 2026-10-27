import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { promises as fs } from 'fs';
import { z } from 'zod';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { StateManagerService } from '../state/state-manager.service';
import { videoStyleSchema } from './schemas';
import { effectPresetSchema } from './schemas/effect-preset.schema';
import { effectRulesSchema } from './schemas/effect-rules.schema';
import { effectSchema } from './schemas/effect.schema';
import type { EffectPreset } from './types/effect-preset.type';
import type { EffectDef } from './types/effect.type';
import type { VideoUpload } from './types/video-upload.type';
import { VideoEffectsService } from './video-effects.service';
import { VideoJobService } from './video-job.service';
import { VideoLibraryService } from './video-library.service';
import { VideoUploadInterceptor } from './video-upload.interceptor';

@Controller('api/projects/:id/video')
export class VideoEffectsController {
  constructor(
    private readonly state: StateManagerService,
    private readonly effects: VideoEffectsService,
    private readonly library: VideoLibraryService,
    private readonly jobs: VideoJobService,
  ) {}

  @Get('effects')
  public async list(@Param('id') id: string) {
    const video = (await this.state.getState(id)).video;

    return {
      effects: video?.effects ?? [],
      rules: video?.effectRules,
      assignments: video?.effectAssignments ?? {},
    };
  }

  @Post('effects')
  @UseInterceptors(VideoUploadInterceptor)
  public async upload(
    @Param('id') id: string,
    @UploadedFiles() files: VideoUpload[],
  ) {
    await this.effects.assertIdle(id);

    const results: EffectDef[] = [];

    for (const file of files ?? []) {
      results.push(await this.effects.upload(id, file));
    }

    return results;
  }

  @Patch('effects/:effectId')
  public async edit(
    @Param('id') id: string,
    @Param('effectId') effectId: string,
    @Body(
      new ZodValidationPipe(
        effectSchema
          .pick({
            name: true,
            blend: true,
            opacity: true,
            speed: true,
            scale: true,
            maxBrightness: true,
          })
          .partial(),
      ),
    )
    patch: Partial<EffectDef>,
  ) {
    await this.effects.assertIdle(id);
    await this.state.updateState(id, (current) => {
      const effect = current.video?.effects?.find(
        (item) => item.id === effectId,
      );

      if (!effect) {
        throw new BadRequestException('Unknown effect');
      }

      Object.assign(effect, patch);
    });
  }

  @Post('effects/presets')
  public async preset(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(effectPresetSchema)) preset: EffectPreset,
  ) {
    return this.jobs.start(
      id,
      'effect_preset',
      undefined,
      undefined,
      undefined,
      preset,
    );
  }

  @Delete('effects/:effectId')
  public async remove(
    @Param('id') id: string,
    @Param(
      'effectId',
      new ZodValidationPipe(z.string().regex(/^[a-f0-9]{16}$/)),
    )
    effectId: string,
  ) {
    await this.effects.assertIdle(id);
    await this.state.updateState(id, (current) => {
      if (current.video) {
        current.video.effects = current.video.effects?.filter(
          (effect) => effect.id !== effectId,
        );

        for (const ids of Object.values(
          current.video.effectAssignments ?? {},
        )) {
          const index = ids.indexOf(effectId);

          if (index >= 0) {
            ids.splice(index, 1);
          }
        }

        if (current.video.effectRules?.defaultEffectId === effectId) {
          delete current.video.effectRules;
        }
      }
    });
    await fs.rm(this.library.path(id, `effects/${effectId}`), {
      recursive: true,
      force: true,
    });
  }

  @Put('effects/rules')
  public async rules(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(effectRulesSchema))
    rules: z.infer<typeof effectRulesSchema>,
  ) {
    await this.effects.assertIdle(id);
    await this.state.updateState(id, (current) => {
      current.video ??= { style: videoStyleSchema.parse({}) };

      if (
        rules.defaultEffectId &&
        !current.video.effects?.some(
          (effect) => effect.id === rules.defaultEffectId,
        )
      ) {
        throw new BadRequestException('Unknown effect');
      }

      current.video.effectRules = rules;
    });
  }

  @Put('clips/effects')
  public async assign(
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.strictObject({
          clipIds: z
            .array(z.string().regex(/^[a-f0-9]{16}$/))
            .min(1)
            .max(1000),
          effectIds: z.array(z.string().regex(/^[a-f0-9]{16}$/)).max(2),
        }),
      ),
    )
    body: { clipIds: string[]; effectIds: string[] },
  ) {
    await this.effects.assertIdle(id);

    for (const clipId of body.clipIds) {
      await this.library.get(id, clipId);
    }

    await this.state.updateState(id, (current) => {
      current.video ??= { style: videoStyleSchema.parse({}) };

      if (
        body.effectIds.some(
          (effectId) =>
            !current.video?.effects?.some((effect) => effect.id === effectId),
        )
      ) {
        throw new BadRequestException('Unknown effect');
      }

      current.video.effectAssignments ??= {};

      for (const clipId of body.clipIds) {
        current.video.effectAssignments[clipId] = body.effectIds;
      }
    });
  }

  @Get('effects/:effectId/preview')
  public async preview(
    @Param('id') id: string,
    @Param('effectId') effectId: string,
    @Res() response: Response,
  ) {
    const effect = (await this.state.getState(id)).video?.effects?.find(
      (item) => item.id === effectId,
    );

    if (!effect) {
      throw new BadRequestException('Unknown effect');
    }

    response.sendFile(this.state.getArtifactPath(id, effect.path), {
      acceptRanges: true,
    });
  }
}
