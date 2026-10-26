import { z } from 'zod';
import { musicTrackSchema } from '../schemas';

export type MusicTrack = z.infer<typeof musicTrackSchema>;
