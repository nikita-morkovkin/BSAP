import type { z } from 'zod';
import type { profileSchema } from '../schemas/profile.schema';

export type Profile = z.infer<typeof profileSchema>;
