import { z } from 'zod';
import { musicCatalogSchema } from '../schemas';

export type MusicCatalog = z.infer<typeof musicCatalogSchema>;
