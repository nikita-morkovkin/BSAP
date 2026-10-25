import { z } from 'zod';

export const mediaArtifactSchema = z.enum([
  'wav',
  'flac',
  'timestamps',
  'markers',
]);
