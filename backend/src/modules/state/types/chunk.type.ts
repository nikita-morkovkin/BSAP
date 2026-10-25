import type { z } from 'zod';
import type { chunkSchema } from '../schemas/chunk.schema';

export type Chunk = z.infer<typeof chunkSchema>;
