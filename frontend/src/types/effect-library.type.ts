import type { VideoEffect } from './video-effect.type';

export type EffectLibrary = {
  effects: VideoEffect[]; assignments: Record<string, string[]>;
  rules?: { defaultEffectId?: string; applyToPercent: number; seed: number };
};