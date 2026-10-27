import { z } from 'zod';

export const videoProbeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      avg_frame_rate: z.string().optional(),
      r_frame_rate: z.string().optional(),
      pix_fmt: z.string().optional(),
      tags: z.object({ alpha_mode: z.string().optional() }).optional(),
      duration: z.string().optional(),
    }),
  ),
  format: z.object({ duration: z.string().optional() }),
});
