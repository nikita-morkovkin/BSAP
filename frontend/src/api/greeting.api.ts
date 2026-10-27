import type { GreetingConfig } from '@/types/greeting-config.type';
import type { GreetingStatus } from '@/types/greeting-status.type';
import type { CharacterClip } from '@/types/character-clip.type';
import type { GreetingAnalysis } from '@/types/greeting-analysis.type';
import { axiosInstance } from './axiosInstance';

export const greetingApi = {
  root: (id: string) => `/projects/${encodeURIComponent(id)}/video`,
  lipsync: async (id: string): Promise<void> => {
    await axiosInstance.post(`${greetingApi.root(id)}/greeting/lipsync`, { confirm: true });
  },
  get: async (id: string): Promise<GreetingStatus> => (await axiosInstance.get(`${greetingApi.root(id)}/greeting`)).data,
  save: async (id: string, config: GreetingConfig): Promise<void> => {
    await axiosInstance.put(`${greetingApi.root(id)}/greeting`, config);
  },
  clips: async (id: string): Promise<CharacterClip[]> => (await axiosInstance.get(`${greetingApi.root(id)}/character/clips`)).data,
  upload: async (id: string, files: File[]): Promise<void> => {
    for (const file of files) {
      const body = new FormData();

      body.append('files', file);

      await axiosInstance.post(`${greetingApi.root(id)}/character/clips`, body);
    }
  },
  role: async (id: string, clipId: string, role: CharacterClip['role']): Promise<void> => {
    await axiosInstance.patch(`${greetingApi.root(id)}/character/clips/${clipId}`, { role });
  },
  remove: async (id: string, clipId: string): Promise<void> => {
    await axiosInstance.delete(`${greetingApi.root(id)}/character/clips/${clipId}`);
  },
  start: async (id: string, action: 'regenerate-audio' | 'preview'): Promise<void> => {
    await axiosInstance.post(`${greetingApi.root(id)}/greeting/${action}`);
  },
  analyze: async (id: string, signal: AbortSignal): Promise<GreetingAnalysis> => (await axiosInstance.post(`${greetingApi.root(id)}/greeting/analyze`, {}, { signal })).data,
};