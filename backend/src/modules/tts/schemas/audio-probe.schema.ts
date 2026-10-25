import { z } from 'zod';

export const audioProbeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      duration: z.string().optional(),
    }),
  ),
  format: z.object({
    format_name: z.literal('wav'),
    duration: z.string().optional(),
  }),
});
