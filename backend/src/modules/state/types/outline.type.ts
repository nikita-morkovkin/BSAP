import type { z } from 'zod';
import type { outlineSchema } from '../schemas/outline.schema';

export type Outline = z.infer<typeof outlineSchema>;
