import { musicNameSchema } from '../schemas';

export class MusicNameDto {
  public static readonly schema = musicNameSchema;

  public displayName!: string;
}
