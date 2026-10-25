import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import { useUiStore } from '@/store/ui.store';
import type { CreateProjectPayload, ProjectState } from '@/types/project.types';

type ReturnProps = UseMutationResult<ProjectState, Error, CreateProjectPayload>;

export const useCreateProjectMutation = (): ReturnProps => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: apiClient.projects.createProject,
    onSuccess: async (state) => {
      client.setQueryData(queryKeys.project(state.projectId), { state, outline: null });
      useUiStore.getState().selectProject(state.projectId);
      toast.success('Episode queued for production');
      await client.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
};