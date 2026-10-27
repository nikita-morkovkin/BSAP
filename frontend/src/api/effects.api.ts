import type { EffectLibrary } from '@/types/effect-library.type';
import type { VideoEffect } from '@/types/video-effect.type';
import type { EffectPreset } from '@/types/effect-preset.type';
import { axiosInstance } from './axiosInstance';

export const effectsApi = {
  root: (id: string) => `/projects/${encodeURIComponent(id)}/video`,
  preset: async (id: string, presetKind: EffectPreset, seed: number): Promise<void> => {
    await axiosInstance.post(`${effectsApi.root(id)}/effects/presets`, { presetKind, seed });
  },
  list: async (id: string): Promise<EffectLibrary> => (await axiosInstance.get(`${effectsApi.root(id)}/effects`)).data,
  upload: async (id: string, files: File[]): Promise<void> => {
    for (const file of files) {
      const body = new FormData();

      body.append('files', file);

      await axiosInstance.post(`${effectsApi.root(id)}/effects`, body);
    }
  },
  edit: async (id: string, effect: VideoEffect): Promise<void> => {
    const { name, blend, opacity, speed, scale, maxBrightness } = effect;

    await axiosInstance.patch(`${effectsApi.root(id)}/effects/${effect.id}`, { name, blend, opacity, speed, scale, maxBrightness });
  },
  remove: async (id: string, effectId: string): Promise<void> => {
    await axiosInstance.delete(`${effectsApi.root(id)}/effects/${effectId}`);
  },
  assign: async (id: string, clipIds: string[], effectIds: string[]): Promise<void> => {
    await axiosInstance.put(`${effectsApi.root(id)}/clips/effects`, { clipIds, effectIds });
  },
  rules: async (id: string, rules: NonNullable<EffectLibrary['rules']>): Promise<void> => {
    await axiosInstance.put(`${effectsApi.root(id)}/effects/rules`, rules);
  },
};