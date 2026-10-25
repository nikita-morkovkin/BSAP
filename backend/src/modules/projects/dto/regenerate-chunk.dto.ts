import { regenerateChunkSchema } from '../schemas/regenerate-chunk.schema';

export class RegenerateChunkDto {
  public static readonly schema = regenerateChunkSchema;

  public text?: string;
  public ttsVoice?: string;
  public ttsSpeed?: number;
  public pauseAfterMs?: number;
}
