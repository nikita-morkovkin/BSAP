import { z } from 'zod';

export class VideoFullDto {
  public static readonly schema = z.strictObject({
    durationSec: z.number().positive().max(86400).optional(),
  });

  public durationSec?: number;
}
