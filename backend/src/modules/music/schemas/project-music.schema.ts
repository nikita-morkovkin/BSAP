import { z } from 'zod';
import { musicSelectionSchema } from './music-selection.schema';
import { musicTrackSchema } from './music-track.schema';

export const projectMusicSchema = z
  .strictObject({
    revision: z.number().int().nonnegative().safe(),
    selectedTrackIds: musicSelectionSchema,
    snapshots: z.array(
      musicTrackSchema.extend({
        filePath: z
          .string()
          .regex(/^music\/[a-f0-9-]+\/[a-f0-9-]+\.(wav|mp3)$/),
      }),
    ),
  })
  .refine(
    (music) =>
      music.selectedTrackIds.length === music.snapshots.length &&
      music.selectedTrackIds.every(
        (id, index) => music.snapshots[index].id === id,
      ),
    'Snapshot order must exactly match selected track IDs',
  );
