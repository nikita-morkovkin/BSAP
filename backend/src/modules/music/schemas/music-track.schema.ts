import { z } from 'zod';

export const musicTrackSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string().trim().min(1).max(160),
  originalFilename: z.string().min(1).max(255),
  version: z.uuid(),
  filePath: z.string().regex(/^sources\/[a-f0-9-]+\.(wav|mp3)$/),
  durationSeconds: z.number().positive().finite(),
  sizeBytes: z.number().int().positive().safe(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
