import { z } from 'zod';
import { masteringConfigSchema } from './mastering-config.schema';
import { voiceIdSchema } from './voice-id.schema';

export const profileSchema = z.strictObject({
  architectModel: z.string().trim().min(1),
  writerModel: z.string().trim().min(1),
  architectReasoningEffort: z.string().trim().min(1),
  writerReasoningEffort: z.string().trim().min(1),
  temperature: z.number().min(0).max(2),
  architectSystemPrompt: z.string().trim().min(1),
  writerSystemPrompt: z.string().trim().min(1),
  ttsVoice: voiceIdSchema,
  ttsSpeed: z.number().min(0.25).max(4),
  maxChunkChars: z.number().int().positive().max(200).default(200),
  masteringConfig: masteringConfigSchema,
});
