import type { VideoStyleConfig } from './video-style.type';

export type VideoTask = {
  projectId: string;
  jobId: string;
  kind: 'build' | 'preview' | 'mux';
  style: VideoStyleConfig;
};
