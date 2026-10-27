import type { z } from 'zod';
import type { videoStyleSchema } from '../schemas/video-style.schema';

export type VideoStyleConfig = z.infer<typeof videoStyleSchema>;
