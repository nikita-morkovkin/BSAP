import { updateProjectMusicSchema } from '../schemas';

export class UpdateProjectMusicDto {
  public static readonly schema = updateProjectMusicSchema;

  public revision!: number;
  public selectedTrackIds!: string[];
  public ambientVolumeDb?: number;
}
