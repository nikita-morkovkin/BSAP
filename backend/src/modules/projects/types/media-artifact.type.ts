import { z } from 'zod';
import { mediaArtifactSchema } from '../schemas';

export type MediaArtifact = z.infer<typeof mediaArtifactSchema>;
