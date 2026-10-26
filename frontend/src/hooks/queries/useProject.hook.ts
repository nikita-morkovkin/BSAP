import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import type { ProjectDetail } from '@/types/project.types';
import { projectPollingInterval } from '@/utils/project.util';

type HookProps = { id: string };
type ReturnProps = UseQueryResult<ProjectDetail, Error>;

export const useProject = ({ id }: HookProps): ReturnProps => useQuery({
  queryKey: queryKeys.project(id),
  queryFn: ({ signal }) => apiClient.projects.getProject(id, signal),
  enabled: Boolean(id),
  refetchInterval: (query) => query.state.data?.productionBusy ? 1500 : projectPollingInterval(query.state.data?.state.status),
});