import { z } from 'zod';

export const musicSelectionSchema = z
  .array(z.uuid())
  .max(200)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Track IDs must be unique and ordered',
  );
