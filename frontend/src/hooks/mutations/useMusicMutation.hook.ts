import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import type { MusicAction } from '@/types/music.types';

type ReturnProps = UseMutationResult<void, Error, MusicAction>;

export const useMusicMutation = (): ReturnProps => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: apiClient.music.change,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.music });
    },
  });
};