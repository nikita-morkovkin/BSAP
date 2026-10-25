import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import type { ProjectDetail, ProjectState } from '@/types/project.types';

type HookProps = { id: string };
type ReturnProps = UseMutationResult<ProjectState, Error, void>;

export const useCancelOutlineMutation = ({ id }: HookProps): ReturnProps => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.projects.cancelOutline(id),
    onSuccess: async (state) => {
      client.setQueryData<ProjectDetail>(queryKeys.project(id), (previous) => ({
        state, outline: previous?.outline ?? null,
      }));
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.project(id) }),
        client.invalidateQueries({ queryKey: queryKeys.projects }),
      ]);
    },
  });
};