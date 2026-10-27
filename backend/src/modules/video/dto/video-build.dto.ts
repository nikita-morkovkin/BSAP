import { z } from 'zod';
import { videoStyleSchema } from '../schemas/video-style.schema';
import type { VideoStyleConfig } from '../types/video-style.type';

export class VideoBuildDto {
  public static readonly schema = z.strictObject({
    style: videoStyleSchema.optional(),
  });

  public style?: VideoStyleConfig;
}
