import { z } from 'zod';
import { effectPresetSchema } from '../schemas/effect-preset.schema';

export type EffectPreset = z.infer<typeof effectPresetSchema>;
