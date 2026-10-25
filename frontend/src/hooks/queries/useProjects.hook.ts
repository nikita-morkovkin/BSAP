import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys, POLLING_INTERVAL_MS } from '@/consts/query.consts';
import type { ProjectSummary } from '@/types/project.types';

type ReturnProps = UseQueryResult<ProjectSummary[], Error>;

export const useProjects = (): ReturnProps => useQuery({
  queryKey: queryKeys.projects,
  queryFn: ({ signal }) => apiClient.projects.getProjects(signal),
  refetchInterval: POLLING_INTERVAL_MS,
});