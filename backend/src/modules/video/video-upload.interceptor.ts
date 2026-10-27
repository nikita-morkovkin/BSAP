import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { finalize, Observable } from 'rxjs';
import type { VideoUpload } from './types/video-upload.type';

@Injectable()
export class VideoUploadInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  public async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<{ files?: VideoUpload[] }>();
    const cleanup = () => {
      for (const file of request.files ?? []) {
        fs.rm(file.path, { force: true }).catch(() => undefined);
      }
    };
    const Interceptor = FilesInterceptor('files', 100, {
      dest: tmpdir(),
      limits: {
        fileSize: Number(
          this.config.get('VIDEO_MAX_UPLOAD_BYTES') ?? 1073741824,
        ),
        files: 100,
        fields: 2,
      },
    });

    try {
      const result = await new Interceptor().intercept(context, next);

      return result.pipe(finalize(cleanup));
    } catch (error) {
      cleanup();

      throw error;
    }
  }
}
