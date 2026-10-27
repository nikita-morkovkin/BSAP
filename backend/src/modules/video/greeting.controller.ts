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
import { GreetingVadService } from './greeting-vad.service';
import { videoStyleSchema } from './schemas';
import { greetingSchema } from './schemas/greeting.schema';
import type { GreetingConfig } from './types/greeting-config.type';
import type { VideoUpload } from './types/video-upload.type';
import { VideoEffectsService } from './video-effects.service';
import { VideoJobService } from './video-job.service';
import { VideoLibraryService } from './video-library.service';
import { VideoUploadInterceptor } from './video-upload.interceptor';

@Controller('api/projects/:id/video')
export class GreetingController {
  constructor(
    private readonly state: StateManagerService,
    private readonly library: VideoLibraryService,
    private readonly jobs: VideoJobService,
    private readonly effects: VideoEffectsService,
    private readonly vad: GreetingVadService,
  ) {}

  @Get('greeting')
  public async get(@Param('id') id: string) {
    const state = await this.state.getState(id);

    const first =
      Object.values(state.chapters).sort(
        (a, b) => a.chapterNumber - b.chapterNumber,
      )[0]?.chunks[0]?.text ?? '';

    return {
      config: state.video?.greeting ?? greetingSchema.parse({ text: first }),
      audio: state.video?.greetingAudio,
      preview: state.video?.greetingPreview,
    };
  }

  @Put('greeting')
  public async save(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(greetingSchema)) config: GreetingConfig,
  ) {
    await this.effects.assertIdle(id);

    await this.state.updateState(id, (current) => {
      if (['MASTERING', 'SYNTHESIZING_AUDIO'].includes(current.status)) {
        throw new BadRequestException(
          'Wait for audio production before changing greeting settings',
        );
      }

      current.video ??= { style: videoStyleSchema.parse({}) };

      const previous = current.video.greeting;
      const audioChanged =
        previous?.text !== config.text ||
        (previous?.lipSyncMode === 'native_veo_audio') !==
          (config.lipSyncMode === 'native_veo_audio') ||
        previous?.nativeClipId !== config.nativeClipId ||
        previous?.leadInSec !== config.leadInSec;

      if (
        audioChanged ||
        previous?.enabled !== config.enabled ||
        previous?.leadInSec !== config.leadInSec
      ) {
        current.mixNeedsRebuild = true;
      }

      current.video.greeting = config;

      if (audioChanged) {
        delete current.video.greetingAudio;
      }

      delete current.video.greetingClip;
      delete current.video.greetingClipInputHash;
      delete current.video.greetingPreview;
    });

    return config;
  }

  @Post('greeting/analyze')
  public async analyze(@Param('id') id: string) {
    return this.vad.analyze(id);
  }

  @Post('greeting/regenerate-audio')
  public async regenerate(@Param('id') id: string) {
    return this.jobs.start(id, 'greeting_audio');
  }

  @Post('greeting/preview')
  public async preview(@Param('id') id: string) {
    return this.jobs.start(id, 'greeting_preview');
  }

  @Post('greeting/lipsync')
  public async lipsync(
    @Param('id') id: string,
    @Body('confirm', new ZodValidationPipe(z.literal(true))) confirm: true,
  ) {
    return this.jobs.start(
      id,
      'greeting_lipsync',
      undefined,
      undefined,
      undefined,
      undefined,
      confirm,
    );
  }

  @Get('greeting/preview')
  public async output(@Param('id') id: string, @Res() response: Response) {
    const path = (await this.state.getState(id)).video?.greetingPreview;

    if (!path) {
      throw new BadRequestException('Build a greeting preview first');
    }

    response.sendFile(this.state.getArtifactPath(id, path), {
      acceptRanges: true,
    });
  }

  @Get('character/clips')
  public async clips(@Param('id') id: string) {
    return this.library.list(id, 'character');
  }

  @Post('character/clips')
  @UseInterceptors(VideoUploadInterceptor)
  public async upload(
    @Param('id') id: string,
    @UploadedFiles() files: VideoUpload[],
  ) {
    await this.effects.assertIdle(id);

    const clips: Awaited<ReturnType<VideoLibraryService['upload']>>[] = [];

    for (const file of files ?? []) {
      const clip = await this.library.upload(id, file, 'character');

      if (clip.durationSec > 120) {
        await fs.rm(this.library.path(id, `character/${clip.id}`), {
          recursive: true,
          force: true,
        });

        throw new BadRequestException(
          'Character clips must not exceed two minutes',
        );
      }

      clip.role = 'greeting_source';

      await this.library.save(id, clip, 'character');

      clips.push(clip);
    }

    return clips;
  }

  @Patch('character/clips/:clipId')
  public async role(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Body(
      'role',
      new ZodValidationPipe(z.enum(['idle', 'talk', 'greeting_source'])),
    )
    role: 'idle' | 'talk' | 'greeting_source',
  ) {
    await this.effects.assertIdle(id);

    const clip = await this.library.get(id, clipId, 'character');

    clip.role = role;

    await this.library.save(id, clip, 'character');

    return clip;
  }

  @Delete('character/clips/:clipId')
  public async remove(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
  ) {
    await this.effects.assertIdle(id);
    await this.library.get(id, clipId, 'character');
    await fs.rm(this.library.path(id, `character/${clipId}`), {
      recursive: true,
      force: true,
    });
  }

  @Get('character/clips/:clipId/thumb')
  public async thumb(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Res() response: Response,
  ) {
    const clip = await this.library.get(id, clipId, 'character');

    response.sendFile(this.state.getArtifactPath(id, clip.thumbPath));
  }
}
