import { z } from 'zod';

// Read legacy profiles without ever forwarding blend expressions as voice IDs.
export const voiceIdSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    const legacy =
      /^([a-zA-Z0-9_-]+)\*[\d.]+(?:\+[a-zA-Z0-9_-]+\*[\d.]+)*$/.exec(value);
    return legacy ? legacy[1] : value;
  })
  .pipe(
    z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Select a single available voice ID'),
  );
