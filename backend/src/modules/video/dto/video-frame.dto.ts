import { z } from 'zod';
import { videoStyleSchema } from '../schemas/video-style.schema';
import type { VideoStyleConfig } from '../types/video-style.type';

export class VideoFrameDto {
  public static readonly schema = z.strictObject({
    style: videoStyleSchema,
    effectIds: z
      .array(z.string().regex(/^[a-f0-9]{16}$/))
      .max(2)
      .optional(),
    t: z.number().min(0).max(600).optional(),
    clipId: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .optional(),
  });

  public style!: VideoStyleConfig;
  public clipId?: string;
  public effectIds?: string[];
  public t?: number;
}
