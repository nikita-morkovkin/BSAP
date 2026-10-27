import { mediaApi } from './media.api';
import { projectsApi } from './projects.api';
import { musicApi } from './music.api';
import { videoApi } from './video.api';

export const apiClient = { projects: projectsApi, media: mediaApi, music: musicApi, video: videoApi };