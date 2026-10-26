import { z } from 'zod';
import { projectMusicSchema } from '../schemas';

export type ProjectMusic = z.infer<typeof projectMusicSchema>;
