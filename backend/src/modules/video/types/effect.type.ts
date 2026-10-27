import { z } from 'zod';
import { effectSchema } from '../schemas/effect.schema';

export type EffectDef = z.infer<typeof effectSchema>;
