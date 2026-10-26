import { z } from 'zod';
import { profileSchema, stateSchema } from '../../state/schemas';
import { musicSelectionSchema } from '../../music/schemas/music-selection.schema';

export const createProjectSchema = z.strictObject({
  topic: stateSchema.shape.topic,
  profile: profileSchema,
  selectedTrackIds: musicSelectionSchema.optional(),
});
