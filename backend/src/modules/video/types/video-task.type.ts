import type { VideoStyleConfig } from './video-style.type';
import type { EffectPreset } from './effect-preset.type';

export type VideoTask = {
  projectId: string;
  jobId: string;
  kind:
    | 'build'
    | 'preview'
    | 'mux'
    | 'video_full'
    | 'effect_preset';
  durationSec?: number;
  preset?: EffectPreset;
  style: VideoStyleConfig;
};
