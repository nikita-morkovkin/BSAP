import { mediaApi } from './media.api';
import { projectsApi } from './projects.api';
import { musicApi } from './music.api';
import { videoApi } from './video.api';
import { exportsApi } from './exports.api';
import { effectsApi } from './effects.api';
import { greetingApi } from './greeting.api';

export const apiClient = { projects: projectsApi, media: mediaApi, music: musicApi, video: videoApi, exports: exportsApi, effects: effectsApi, greeting: greetingApi };