import { z } from 'zod';

export class VideoFullDto {
  public static readonly schema = z.strictObject({
    durationSec: z.number().positive().max(86400).optional(),
    includeGreeting: z.boolean().optional(),
  });

  public durationSec?: number;
  public includeGreeting?: boolean;
}
