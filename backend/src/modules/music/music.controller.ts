import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { MusicNameDto } from './dto/music-name.dto';
import { MusicService } from './music.service';
import { MusicUploadInterceptor } from './music-upload.interceptor';
import type { MusicUpload } from './types/music-upload.type';

@Controller('api/music')
export class MusicController {
  constructor(private readonly music: MusicService) {}

  @Get()
  public async list() {
    return this.music.list();
  }

  @Post()
  @UseInterceptors(MusicUploadInterceptor)
  public async upload(
    @UploadedFile() file: MusicUpload | undefined,
    @Body('displayName') name?: string,
  ) {
    return this.music.upload(file, name);
  }

  @Patch(':trackId')
  public async rename(
    @Param('trackId', new ZodValidationPipe(z.uuid())) id: string,
    @Body() payload: MusicNameDto,
  ) {
    return this.music.rename(id, payload.displayName);
  }

  @Put(':trackId/file')
  @UseInterceptors(MusicUploadInterceptor)
  public async replace(
    @Param('trackId', new ZodValidationPipe(z.uuid())) id: string,
    @UploadedFile() file: MusicUpload | undefined,
  ) {
    return this.music.upload(file, undefined, id);
  }

  @Delete(':trackId')
  @HttpCode(204)
  public async delete(
    @Param('trackId', new ZodValidationPipe(z.uuid())) id: string,
  ): Promise<void> {
    await this.music.delete(id);
  }
}
