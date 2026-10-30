import { z } from 'zod';
import { profileSchema, stateSchema } from '../../state/schemas';
import { musicSelectionSchema } from '../../music/schemas/music-selection.schema';

export const createProjectSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  profile: profileSchema,
  selectedTrackIds: musicSelectionSchema.optional(),
});
