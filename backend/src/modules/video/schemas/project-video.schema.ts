import { z } from 'zod';
import { artifactPathSchema } from '../../state/schemas/artifact-path.schema';
import { videoStyleSchema } from './video-style.schema';
import { videoJobSchema } from './video-job.schema';
import { effectSchema } from './effect.schema';
import { effectRulesSchema } from './effect-rules.schema';

export const projectVideoSchema = z.strictObject({
  style: videoStyleSchema,
  job: videoJobSchema.optional(),
  effects: z.array(effectSchema).optional(),
  effectRules: effectRulesSchema.optional(),
  effectAssignments: z
    .record(z.string(), z.array(z.string().regex(/^[a-f0-9]{16}$/)).max(2))
    .optional(),
  cycle: z
    .strictObject({
      path: artifactPathSchema,
      planHash: z.string(),
      inputHash: z.string().optional(),
      duration: z.number().positive(),
      loop: z.boolean(),
      fps: z.number().positive(),
    })
    .optional(),
  output: artifactPathSchema.optional(),
  outputHash: z.string().optional(),
  outputCycleHash: z.string().optional(),
  full: z
    .strictObject({
      path: artifactPathSchema,
      cycleHash: z.string(),
      durationSec: z.number().positive(),
    })
    .optional(),
  preview: artifactPathSchema.optional(),
});
