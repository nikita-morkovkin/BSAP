import { z } from 'zod';

export const musicProbeSchema = z.object({
  format: z.object({ format_name: z.string(), duration: z.string() }),
  streams: z.array(z.object({ codec_type: z.string() })).min(1),
});
