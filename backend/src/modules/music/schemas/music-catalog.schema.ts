import { z } from 'zod';
import { musicTrackSchema } from './music-track.schema';

export const musicCatalogSchema = z.strictObject({
  formatVersion: z.literal(1),
  tracks: z
    .array(musicTrackSchema)
    .refine(
      (tracks) =>
        new Set(tracks.map((track) => track.id)).size === tracks.length,
      'Track IDs must be unique',
    ),
  importErrors: z.array(
    z.strictObject({ filename: z.string(), message: z.string() }),
  ),
});
