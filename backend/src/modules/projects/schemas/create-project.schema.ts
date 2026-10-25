import { z } from 'zod';
import { profileSchema, stateSchema } from '../../state/schemas';

export const createProjectSchema = z.strictObject({
  topic: stateSchema.shape.topic,
  profile: profileSchema,
});
