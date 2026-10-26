import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'fs';
import { Observable, finalize } from 'rxjs';
import type { MusicUpload } from './types/music-upload.type';

@Injectable()
export class MusicUploadInterceptor
  extends FileInterceptor('file')
  implements NestInterceptor
{
  public async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      file?: MusicUpload;
      on: (event: string, callback: () => void) => void;
    }>();
    const cleanup = () => {
      if (request.file) {
        fs.rm(request.file.path, { force: true }).catch(() => undefined);
      }
    };

    request.on('aborted', cleanup);

    try {
      const result = await super.intercept(context, next);

      return result.pipe(finalize(cleanup));
    } catch (error) {
      cleanup();

      throw error;
    }
  }
}
