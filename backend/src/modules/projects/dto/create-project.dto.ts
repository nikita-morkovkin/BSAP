import { Profile } from '../../state/types';
import { createProjectSchema } from '../schemas/create-project.schema';

export class CreateProjectDto {
  public static readonly schema = createProjectSchema;

  public title!: string;
  public description!: string;
  public profile!: Profile;
  public selectedTrackIds?: string[];
}
