import type { MediaArtifact } from '@/types/project.types';
import { axiosInstance } from './axiosInstance';

const mediaPath = (id: string) => `/projects/${encodeURIComponent(id)}/media`;

export const downloadMediaUrl = (id: string, artifact: MediaArtifact): string =>
  axiosInstance.getUri({ url: `${mediaPath(id)}/download/${artifact}` });

export const downloadChapterUrl = (id: string, chapterNumber: number): string =>
  axiosInstance.getUri({ url: `${mediaPath(id)}/chapters/${chapterNumber}/download` });

export const chunkAudioUrl = (id: string, chunkId: string, revision: string): string =>
  axiosInstance.getUri({
    url: `${mediaPath(id)}/chunks/${encodeURIComponent(chunkId)}`,
    params: { revision },
  });

export const getTimestamps = async (id: string, signal?: AbortSignal): Promise<string> => {
  const { data } = await axiosInstance.get<string>(`${mediaPath(id)}/download/timestamps`, {
    responseType: 'text', signal,
  });

  return data;
};

export const mediaApi = {
  downloadMediaUrl,
  downloadChapterUrl,
  chunkAudioUrl,
  getTimestamps,
};