import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import type { Profile } from '@/types/project.types';

type ReturnProps = UseQueryResult<Profile, Error>;

export const useProjectDefaults = (): ReturnProps => useQuery({
  queryKey: queryKeys.defaults,
  queryFn: ({ signal }) => apiClient.projects.getDefaults(signal),
  staleTime: Infinity,
});