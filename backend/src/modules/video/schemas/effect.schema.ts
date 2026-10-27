import { z } from 'zod';
import { artifactPathSchema } from '../../state/schemas/artifact-path.schema';

export const effectSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{16}$/),
  name: z.string().trim().min(1).max(100),
  source: z.enum(['uploaded', 'preset']).default('uploaded'),
  presetKind: z
    .enum([
      'marine_snow',
      'bubbles_rising',
      'light_rays',
      'dust_motes',
      'plankton_sparkle',
    ])
    .optional(),
  seed: z.number().int().nonnegative().optional(),
  path: artifactPathSchema,
  thumbPath: artifactPathSchema,
  durationSec: z.number().positive().max(600),
  hasAlpha: z.boolean(),
  blend: z.enum(['screen', 'add', 'overlay_alpha']).default('screen'),
  opacity: z.number().min(0).max(1).default(0.5),
  speed: z.number().min(0.25).max(2).default(1),
  scale: z.number().min(0.5).max(2).default(1),
  maxBrightness: z.number().min(0).max(1).default(0.8),
});
