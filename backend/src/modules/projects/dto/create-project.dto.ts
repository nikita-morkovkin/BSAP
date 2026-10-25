import { Profile } from '../../state/types';
import { createProjectSchema } from '../schemas/create-project.schema';

export class CreateProjectDto {
  public static readonly schema = createProjectSchema;

  public topic!: string;
  public profile!: Profile;
}
