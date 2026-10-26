import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import type { ProjectMusicAction } from '@/types/music.types';
import type { ProjectDetail, ProjectState } from '@/types/project.types';

type HookProps = { projectId: string };
type ReturnProps = UseMutationResult<ProjectState, Error, ProjectMusicAction>;

export const useProjectMusicMutation = ({ projectId }: HookProps): ReturnProps => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (action: ProjectMusicAction) => apiClient.music.project(projectId, action),
    onSuccess: async (state) => {
      client.setQueryData<ProjectDetail>(queryKeys.project(projectId), (previous) => ({
        state, outline: previous?.outline ?? null,
      }));

      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.projects }),
        client.invalidateQueries({ queryKey: ['timestamps', projectId] }),
      ]);
    },
  });
};