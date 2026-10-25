import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/api/axiosInstance';
import type { ModelOption, VoiceOption } from '@/types/settings.types';

export const useModels = () => useQuery({
  queryKey: ['settings', 'models'],
  queryFn: async ({ signal }) => (await axiosInstance.get<ModelOption[]>('/settings/models', { signal })).data,
  staleTime: 300000,
});
export const useVoices = () => useQuery({
  queryKey: ['settings', 'voices'],
  queryFn: async ({ signal }) => (await axiosInstance.get<VoiceOption[]>('/settings/voices', { signal })).data,
  staleTime: 300000,
});