import { mediaApi } from './media.api';
import { projectsApi } from './projects.api';

export const apiClient = { projects: projectsApi, media: mediaApi };