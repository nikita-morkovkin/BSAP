import { z } from 'zod';
import { artifactPathSchema } from './artifact-path.schema';
import { chunkSchema } from './chunk.schema';

export const chapterSchema = z.strictObject({
  chapterNumber: z.number().int().positive(),
  title: z.string().trim().min(1),
  scriptStatus: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  ttsStatus: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  scriptFilePath: artifactPathSchema,
  audioFilePath: artifactPathSchema,
  durationMs: z.number().int().nonnegative(),
  chunks: z
    .array(chunkSchema)
    .refine(
      (chunks) =>
        new Set(chunks.map((chunk) => chunk.id)).size === chunks.length &&
        new Set(chunks.map((chunk) => chunk.index)).size === chunks.length,
      'Chunk IDs and indexes must be unique within a chapter',
    ),
});
