import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import { useAudioPlayerStore } from '@/store/audioPlayer.store';
import type { ProjectDetail, ProjectState, RegenerateChunkVariables, RegenerationContext } from '@/types/project.types';
import { optimisticRegeneration } from '@/utils/project.util';

type HookProps = { id: string };
type ReturnProps = UseMutationResult<ProjectState, Error, RegenerateChunkVariables, RegenerationContext>;

export const useRegenerateChunkMutation = ({ id }: HookProps): ReturnProps => {
  const client = useQueryClient();
  const key = queryKeys.project(id);

  return useMutation({
    mutationFn: ({ chapterNumber, chunkId, payload }) =>
      apiClient.projects.regenerateChunk(id, chapterNumber, chunkId, payload),
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: key });

      const previous = client.getQueryData<ProjectDetail>(key);

      useAudioPlayerStore.getState().reset();

      if (previous) {
        client.setQueryData(key, optimisticRegeneration(previous, variables));
      }

      return { previous };
    },
    onSuccess: (state) => {
      client.setQueryData<ProjectDetail>(key, (previous) => ({
        state, outline: previous?.outline ?? null,
      }));
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        client.setQueryData(key, context.previous);
      }
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: queryKeys.projects }),
      ]);
    },
  });
};