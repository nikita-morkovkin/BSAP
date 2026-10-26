import { z } from 'zod';
import { musicSelectionSchema } from './music-selection.schema';

export const updateProjectMusicSchema = z.strictObject({
  revision: z.number().int().nonnegative().safe(),
  selectedTrackIds: musicSelectionSchema,
});
