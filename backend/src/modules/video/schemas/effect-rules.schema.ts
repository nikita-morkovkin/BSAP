import { z } from 'zod';

export const effectRulesSchema = z.strictObject({
  defaultEffectId: z
    .string()
    .regex(/^[a-f0-9]{16}$/)
    .optional(),
  applyToPercent: z.number().min(0).max(100).default(0),
  seed: z.number().int().min(0).max(4294967295).default(1),
});
