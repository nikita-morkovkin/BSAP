import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { VideoFullDto } from './dto/video-full.dto';
import { ExportService } from './export.service';
import { exportKindSchema } from './schemas/export-kind.schema';
import type { ExportKind } from './types/export-kind.type';
import { VideoJobService } from './video-job.service';

@Controller('api/projects/:id/exports')
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly jobs: VideoJobService,
  ) {}

  @Get()
  public async list(@Param('id') id: string) {
    return this.exports.list(id);
  }

  @Get('zip')
  public async zip(
    @Param('id') id: string,
    @Query('kinds') kinds: string,
    @Res() response: Response,
  ) {
    const selection = z
      .array(exportKindSchema)
      .min(1)
      .max(7)
      .safeParse(kinds?.split(','));

    if (!selection.success) {
      throw new BadRequestException('Select one to seven valid export kinds');
    }

    const files = await Promise.all(
      [...new Set(selection.data)].map(async (kind) => ({
        kind,
        path: await this.exports.resolve(id, kind),
      })),
    );
    const { ZipArchive } = await import('archiver');
    const archive = new ZipArchive({ store: true });

    response.attachment(`${id}_exports.zip`);
    response.on('close', () => archive.abort());
    archive.on('error', (error: Error) => response.destroy(error));
    archive.on('warning', (error: Error) => response.destroy(error));
    archive.pipe(response);

    for (const file of files) {
      const extension = file.path.split('.').pop();

      archive.file(file.path, { name: `${id}_${file.kind}.${extension}` });
    }

    await archive.finalize();
  }

  @Get(':kind/download')
  public async download(
    @Param('id') id: string,
    @Param('kind', new ZodValidationPipe(exportKindSchema)) kind: ExportKind,
    @Query('format') format: string | undefined,
    @Query(
      'applyMixGain',
      new ZodValidationPipe(z.enum(['true', 'false']).optional()),
    )
    gain: string | undefined,
    @Res() response: Response,
  ) {
    const path = await this.exports.resolve(id, kind, format, gain === 'true');
    const extension = path.split('.').pop();

    response.attachment(`${id}_${kind}.${extension}`);
    response.sendFile(path, { acceptRanges: true }, (error) => {
      if (!error) {
        return;
      }

      if (
        !response.headersSent &&
        'statusCode' in error &&
        error.statusCode === 416
      ) {
        response.status(416).end();

        return;
      }

      response.destroy(error);
    });
  }

  @Post(':kind/build')
  public async build(
    @Param('id') id: string,
    @Param('kind', new ZodValidationPipe(exportKindSchema)) kind: ExportKind,
    @Body() body: VideoFullDto,
  ) {
    if (kind !== 'video_full' && kind !== 'final_mp4') {
      throw new BadRequestException(
        'Build this artifact using its upstream production panel',
      );
    }

    return this.jobs.start(
      id,
      kind === 'video_full' ? 'video_full' : 'mux',
      undefined,
      body.durationSec,
    );
  }
}
