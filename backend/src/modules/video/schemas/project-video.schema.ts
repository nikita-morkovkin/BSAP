import { z } from 'zod';
import { artifactPathSchema } from '../../state/schemas/artifact-path.schema';
import { videoStyleSchema } from './video-style.schema';
import { videoJobSchema } from './video-job.schema';

export const projectVideoSchema = z.strictObject({
  style: videoStyleSchema,
  job: videoJobSchema.optional(),
  cycle: z
    .strictObject({
      path: artifactPathSchema,
      planHash: z.string(),
      duration: z.number().positive(),
      loop: z.boolean(),
      fps: z.number().positive(),
    })
    .optional(),
  output: artifactPathSchema.optional(),
  preview: artifactPathSchema.optional(),
});
