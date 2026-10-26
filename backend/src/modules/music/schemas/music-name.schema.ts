import { z } from 'zod';
import { musicTrackSchema } from './music-track.schema';

export const musicNameSchema = z.strictObject({
  displayName: musicTrackSchema.shape.displayName,
});
