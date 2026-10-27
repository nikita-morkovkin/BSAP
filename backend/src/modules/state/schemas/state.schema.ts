import { z } from 'zod';
import { artifactPathSchema } from './artifact-path.schema';
import { chapterSchema } from './chapter.schema';
import { profileSchema } from './profile.schema';
import { projectMusicSchema } from '../../music/schemas/project-music.schema';
import { projectVideoSchema } from '../../video/schemas/project-video.schema';

export const stateSchema = z
  .strictObject({
    projectId: z.string().regex(/^\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    topic: z.string().trim().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    status: z.enum([
      'IDLE',
      'GENERATING_OUTLINE',
      'GENERATING_SCRIPTS',
      'SYNTHESIZING_AUDIO',
      'MASTERING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
    ]),
    error: z.string().optional(),
    music: projectMusicSchema.optional(),
    video: projectVideoSchema.optional(),
    mixRevision: z.number().int().nonnegative().optional(),
    mixNeedsRebuild: z.boolean().optional(),
    profile: profileSchema,
    outlineCompleted: z.boolean(),
    chapters: z
      .record(z.string().regex(/^[1-9]\d*$/), chapterSchema)
      .refine(
        (chapters) =>
          Object.entries(chapters).every(
            ([key, chapter]) => Number(key) === chapter.chapterNumber,
          ),
        'Chapter record keys must match chapterNumber',
      ),
    outputFiles: z.strictObject({
      narration: artifactPathSchema.optional(),
      backgroundMusic: artifactPathSchema.optional(),
      wav: artifactPathSchema.optional(),
      flac: artifactPathSchema.optional(),
      timestamps: artifactPathSchema.optional(),
      markers: artifactPathSchema.optional(),
    }),
  })
  .refine((state) => state.updatedAt >= state.createdAt, {
    message: 'updatedAt must not precede createdAt',
    path: ['updatedAt'],
  });
