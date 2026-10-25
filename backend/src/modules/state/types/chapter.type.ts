import type { z } from 'zod';
import type { chapterSchema } from '../schemas/chapter.schema';

export type Chapter = z.infer<typeof chapterSchema>;
