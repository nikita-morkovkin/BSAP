import { z } from 'zod';

export const effectPresetSchema = z.strictObject({
  presetKind: z.enum([
    'marine_snow',
    'bubbles_rising',
    'light_rays',
    'dust_motes',
    'plankton_sparkle',
  ]),
  seed: z.number().int().min(0).max(4294967295).default(1),
});
