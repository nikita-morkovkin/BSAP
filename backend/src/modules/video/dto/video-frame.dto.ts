import { z } from 'zod';
import { videoStyleSchema } from '../schemas/video-style.schema';
import type { VideoStyleConfig } from '../types/video-style.type';

export class VideoFrameDto {
  public static readonly schema = z.strictObject({
    style: videoStyleSchema,
    clipId: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .optional(),
  });

  public style!: VideoStyleConfig;
  public clipId?: string;
}
