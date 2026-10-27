import { z } from 'zod';
import { musicSelectionSchema } from './music-selection.schema';
import { masteringConfigSchema } from '../../state/schemas/mastering-config.schema';

export const updateProjectMusicSchema = z.strictObject({
  revision: z.number().int().nonnegative().safe(),
  selectedTrackIds: musicSelectionSchema,
  ambientVolumeDb: masteringConfigSchema.shape.ambientVolumeDb.optional(),
});
