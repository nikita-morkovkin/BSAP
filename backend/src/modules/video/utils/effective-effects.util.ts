import type { EffectDef } from '../types/effect.type';
import { videoHash } from './video-hash.util';

export const effectiveEffects = (
  clipId: string,
  effects: EffectDef[],
  assignments: Record<string, string[]>,
  rules?: { defaultEffectId?: string; applyToPercent: number; seed: number },
): EffectDef[] => {
  const chance =
    (parseInt(videoHash({ clipId, seed: rules?.seed }).slice(0, 8), 16) /
      4294967296) *
    100;
  const ids =
    assignments[clipId] ??
    (rules?.defaultEffectId && chance < rules.applyToPercent
      ? [rules.defaultEffectId]
      : []);

  return ids
    .map((id) => effects.find((effect) => effect.id === id))
    .filter((effect): effect is EffectDef => Boolean(effect));
};
