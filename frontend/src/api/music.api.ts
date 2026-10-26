import type { MusicAction, MusicCatalog, ProjectMusicAction } from '@/types/music.types';
import type { ProjectState } from '@/types/project.types';
import { axiosInstance } from './axiosInstance';

export const musicApi = {
  list: async (signal?: AbortSignal): Promise<MusicCatalog> => {
    const { data } = await axiosInstance.get<MusicCatalog>('/music', { signal });

    return data;
  },
  change: async (action: MusicAction): Promise<void> => {
    if (action.kind === 'delete') {
      await axiosInstance.delete(`/music/${encodeURIComponent(action.id)}`);

      return;
    }

    if (action.kind === 'rename') {
      await axiosInstance.patch(`/music/${encodeURIComponent(action.id)}`, { displayName: action.displayName });

      return;
    }

    const body = new FormData();

    body.append('file', action.file);

    if (action.kind === 'upload' && action.displayName.trim()) {
      body.append('displayName', action.displayName.trim());
    }

    const config = { headers: { 'Content-Type': 'multipart/form-data' } };

    if (action.kind === 'replace') {
      await axiosInstance.put(`/music/${encodeURIComponent(action.id)}/file`, body, config);
    } else {
      await axiosInstance.post('/music', body, config);
    }
  },
  project: async (id: string, action: ProjectMusicAction): Promise<ProjectState> => {
    const path = `/projects/${encodeURIComponent(id)}`;

    if (action.kind === 'remaster') {
      return (await axiosInstance.post<ProjectState>(`${path}/remaster`)).data;
    }

    return (await axiosInstance.put<ProjectState>(`${path}/music`, {
      revision: action.revision, selectedTrackIds: action.selectedTrackIds,
    })).data;
  },
};