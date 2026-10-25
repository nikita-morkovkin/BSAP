import { z } from 'zod';
import { chunkSchema, profileSchema } from '../../state/schemas';

export const regenerateChunkSchema = z.strictObject({
  text: chunkSchema.shape.text.optional(),
  ttsVoice: profileSchema.shape.ttsVoice.optional(),
  ttsSpeed: profileSchema.shape.ttsSpeed.optional(),
  pauseAfterMs: chunkSchema.shape.pauseAfterMs.optional(),
});
