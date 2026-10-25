import { z } from 'zod';
import { artifactPathSchema } from './artifact-path.schema';
import { profileSchema } from './profile.schema';

export const chunkSchema = z.strictObject({
  id: z.string().trim().min(1),
  index: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(200),
  pauseAfterMs: z.number().int().nonnegative(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  filePath: artifactPathSchema,
  durationMs: z.number().int().nonnegative(),
  ttsVoice: profileSchema.shape.ttsVoice.optional(),
  ttsSpeed: profileSchema.shape.ttsSpeed.optional(),
});
