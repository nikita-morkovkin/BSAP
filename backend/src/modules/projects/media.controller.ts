import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { stateSchema } from '../state/schemas';
import { MediaService } from './media.service';
import { mediaArtifactSchema } from './schemas';
import type { MediaArtifact } from './types/media-artifact.type';

@Controller('api/projects/:id/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('chunks/:chunkId')
  public async streamChunk(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
    @Param('chunkId', new ZodValidationPipe(z.string().min(1))) chunkId: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.mediaService.streamChunk(projectId, chunkId, range, response);
  }

  @Get('chapters/:chapterNumber/download')
  public async downloadChapter(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
    @Param(
      'chapterNumber',
      new ZodValidationPipe(z.coerce.number().int().positive().safe()),
    )
    chapterNumber: number,
  ) {
    return this.mediaService.downloadChapter(projectId, chapterNumber);
  }

  @Get('download/:artifact')
  public async downloadArtifact(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
    @Param('artifact', new ZodValidationPipe(mediaArtifactSchema))
    artifact: MediaArtifact,
  ) {
    return this.mediaService.downloadArtifact(projectId, artifact);
  }
}
