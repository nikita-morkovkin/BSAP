import { z } from 'zod';
import { masteringConfigSchema } from './mastering-config.schema';

export const profileSchema = z.strictObject({
  architectModel: z.string().trim().min(1),
  writerModel: z.string().trim().min(1),
  architectReasoningEffort: z.enum(['none', 'low', 'medium', 'high']),
  writerReasoningEffort: z.enum(['none', 'low', 'medium', 'high']),
  temperature: z.number().min(0).max(2),
  architectSystemPrompt: z.string().trim().min(1),
  writerSystemPrompt: z.string().trim().min(1),
  ttsVoice: z.string().trim().min(1),
  ttsSpeed: z.number().min(0.25).max(4),
  maxChunkChars: z.number().int().positive().max(200).default(200),
  masteringConfig: masteringConfigSchema,
});
