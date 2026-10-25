import type { CreateProjectPayload, Profile, ProjectDetail, ProjectState, ProjectSummary, RegenerateChunkPayload } from '@/types/project.types';
import { axiosInstance } from './axiosInstance';

const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const getProjects = async (signal?: AbortSignal): Promise<ProjectSummary[]> => {
  const { data } = await axiosInstance.get<ProjectSummary[]>('/projects', { signal });

  return data;
};

export const getDefaults = async (signal?: AbortSignal): Promise<Profile> => {
  const { data } = await axiosInstance.get<Profile>('/projects/defaults', { signal });

  return data;
};

export const getProject = async (id: string, signal?: AbortSignal): Promise<ProjectDetail> => {
  const { data } = await axiosInstance.get<ProjectDetail>(projectPath(id), { signal });

  return data;
};

export const createProject = async (payload: CreateProjectPayload): Promise<ProjectState> => {
  const { data } = await axiosInstance.post<ProjectState>('/projects', payload);

  return data;
};

export const resumeProject = async (id: string): Promise<ProjectState> => {
  const { data } = await axiosInstance.post<ProjectState>(`${projectPath(id)}/resume`);

  return data;
};

export const cancelOutline = async (id: string): Promise<ProjectState> => {
  const { data } = await axiosInstance.post<ProjectState>(`${projectPath(id)}/cancel-outline`);
  return data;
};

export const regenerateChunk = async (
  id: string, chapterNumber: number, chunkId: string, payload: RegenerateChunkPayload,
): Promise<ProjectState> => {
  const path = `${projectPath(id)}/chapters/${chapterNumber}/chunks/${encodeURIComponent(chunkId)}/regenerate`;
  const { data } = await axiosInstance.post<ProjectState>(path, payload);

  return data;
};

export const deleteProject = async (id: string): Promise<void> => {
  await axiosInstance.delete(projectPath(id));
};

export const projectsApi = { getProjects, getDefaults, getProject, createProject, resumeProject, cancelOutline, regenerateChunk, deleteProject };