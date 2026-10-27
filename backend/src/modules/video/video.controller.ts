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
  Query,
  Res,
  Sse,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { promises as fs } from 'fs';
import { from, interval, switchMap, takeWhile } from 'rxjs';
import { z } from 'zod';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { VideoBuildDto } from './dto/video-build.dto';
import { VideoFrameDto } from './dto/video-frame.dto';
import { videoStyleSchema } from './schemas';
import type { VideoStyleConfig } from './types/video-style.type';
import type { VideoUpload } from './types/video-upload.type';
import { VideoLibraryService } from './video-library.service';
import { VideoJobService } from './video-job.service';
import { VideoPreviewService } from './video-preview.service';
import { VideoUploadInterceptor } from './video-upload.interceptor';

@Controller('api/projects/:id/video')
export class VideoController {
  constructor(
    private readonly state: StateManagerService,
    private readonly library: VideoLibraryService,
    private readonly jobs: VideoJobService,
    private readonly preview: VideoPreviewService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  @Get('clips')
  public async list(@Param('id') id: string) {
    return this.library.list(id);
  }

  @Post('clips')
  @UseInterceptors(VideoUploadInterceptor)
  public async upload(
    @Param('id') id: string,
    @UploadedFiles() files: VideoUpload[],
  ) {
    const results: {
      clip?: Awaited<ReturnType<VideoLibraryService['upload']>>;
      name: string;
      error?: string;
    }[] = [];

    for (const file of files ?? []) {
      try {
        results.push({
          name: file.originalname,
          clip: await this.library.upload(id, file),
        });
      } catch (error) {
        results.push({
          name: file.originalname,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    return results;
  }

  @Patch('clips/:clipId')
  public async toggle(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Body('enabled', new ZodValidationPipe(z.boolean())) enabled: boolean,
  ) {
    return this.library.toggle(id, clipId, enabled);
  }

  @Delete('clips/:clipId')
  public async delete(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
  ) {
    await this.library.delete(id, clipId);
  }

  @Delete('cache')
  public async clear(@Param('id') id: string) {
    await this.library.clearCache(id);
  }

  @Get('clips/:clipId/thumb')
  public async thumb(
    @Param('id') id: string,
    @Param('clipId') clipId: string,
    @Res() response: Response,
  ) {
    const clip = await this.library.get(id, clipId);

    response.sendFile(this.state.getArtifactPath(id, clip.thumbPath));
  }

  @Get('settings')
  public async settings(@Param('id') id: string) {
    return (
      (await this.state.getState(id)).video?.style ?? videoStyleSchema.parse({})
    );
  }

  @Put('settings')
  public async saveSettings(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(videoStyleSchema)) style: VideoStyleConfig,
  ) {
    await this.state.updateState(id, (current) => {
      current.video = { ...current.video, style };
    });

    return style;
  }

  @Get('status')
  public async status(@Param('id') id: string) {
    const state = await this.state.getState(id);
    const audio = await this.ffmpeg.getFinalAudioInfo(id);

    return {
      ...state.video,
      audio: audio ? { duration: audio.duration } : null,
    };
  }

  @Post('preview/frame')
  public async frame(
    @Param('id') id: string,
    @Body() body: VideoFrameDto,
    @Res() response: Response,
  ) {
    response.sendFile(await this.preview.frame(id, body.style, body.clipId));
  }

  @Post('preview/clip')
  public async previewClip(
    @Param('id') id: string,
    @Body() body: VideoBuildDto,
  ) {
    return this.jobs.start(id, 'preview', body.style);
  }

  @Post('build')
  public async build(@Param('id') id: string, @Body() body: VideoBuildDto) {
    return this.jobs.start(id, 'build', body.style);
  }

  @Post('mux')
  public async mux(@Param('id') id: string) {
    return this.jobs.start(id, 'mux');
  }

  @Get('jobs/:jobId')
  public async job(@Param('id') id: string, @Param('jobId') jobId: string) {
    return this.jobs.get(id, jobId);
  }

  @Post('jobs/:jobId/cancel')
  public async cancel(@Param('id') id: string, @Param('jobId') jobId: string) {
    return this.jobs.cancel(id, jobId);
  }

  @Sse('jobs/:jobId/events')
  public events(@Param('id') id: string, @Param('jobId') jobId: string) {
    return interval(1000).pipe(
      switchMap(() =>
        from(this.jobs.get(id, jobId).then((data) => ({ data }))),
      ),
      takeWhile(
        (event) => !['done', 'failed', 'cancelled'].includes(event.data.stage),
        true,
      ),
    );
  }

  @Get('output')
  public async output(
    @Param('id') id: string,
    @Query('kind') kind: string,
    @Res() response: Response,
  ) {
    const video = (await this.state.getState(id)).video;
    const relative =
      kind === 'preview'
        ? video?.preview
        : kind === 'cycle'
          ? video?.cycle?.path
          : video?.output;

    if (!relative) {
      throw new BadRequestException('Requested video output is not ready');
    }

    const path = this.state.getArtifactPath(id, relative);
    const stat = await fs.stat(path);

    response.setHeader('X-Video-Size', stat.size);
    response.sendFile(path, { acceptRanges: true });
  }
}
