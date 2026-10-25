import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import { useUiStore } from '@/store/ui.store';
import { useAudioPlayerStore } from '@/store/audioPlayer.store';

export const useDeleteProjectMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: apiClient.projects.deleteProject,
    onSuccess: async (_, id) => {
      if (useUiStore.getState().selectedProjectId === id) {
        useAudioPlayerStore.getState().reset();
        useUiStore.setState({ selectedProjectId: null, activeTab: 'create', expandedChapters: [] });
      }
      await client.cancelQueries({ queryKey: queryKeys.project(id) });
      client.removeQueries({ queryKey: queryKeys.project(id) });
      client.removeQueries({ queryKey: ['timestamps', id] });
      toast.success('Episode deleted');
      await client.invalidateQueries({ queryKey: queryKeys.projects });
    },
    onError: (error) => {
      toast.error(isAxiosError<{ message: string }>(error) ? error.response?.data.message ?? 'Deletion failed' : 'Deletion failed');
    },
  });
};