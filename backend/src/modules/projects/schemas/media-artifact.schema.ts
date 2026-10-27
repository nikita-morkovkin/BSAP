import { z } from 'zod';

export const mediaArtifactSchema = z.enum([
  'narration',
  'backgroundMusic',
  'wav',
  'flac',
  'timestamps',
  'markers',
]);
