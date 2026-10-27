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
    | 'greeting_audio'
    | 'greeting_preview'
    | 'effect_preset'
    | 'greeting_lipsync';
  confirm?: boolean;
  durationSec?: number;
  includeGreeting?: boolean;
  preset?: EffectPreset;
  style: VideoStyleConfig;
};
