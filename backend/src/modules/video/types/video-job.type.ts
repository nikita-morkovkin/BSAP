import type { z } from 'zod';
import type { videoJobSchema } from '../schemas/video-job.schema';

export type VideoJobState = z.infer<typeof videoJobSchema>;
