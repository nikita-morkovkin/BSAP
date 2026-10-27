import { z } from 'zod';
import { artifactPathSchema } from '../../state/schemas/artifact-path.schema';

export const videoJobSchema = z.strictObject({
  jobId: z.uuid(),
  projectId: z.string(),
  stage: z.enum([
    'queued',
    'normalizing',
    'planning',
    'rendering_chunks',
    'stitching',
    'muxing',
    'done',
    'failed',
    'cancelled',
  ]),
  kind: z.enum(['build', 'preview', 'mux']),
  progress: z.number().min(0).max(1),
  stageProgress: z.number().min(0).max(1),
  startedAt: z.string(),
  updatedAt: z.string(),
  message: z.string().optional(),
  error: z.string().optional(),
  outputPath: artifactPathSchema.optional(),
});
