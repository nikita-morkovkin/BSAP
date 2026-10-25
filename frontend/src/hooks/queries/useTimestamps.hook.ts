import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';

type HookProps = { id: string; revision: string; enabled: boolean };
type ReturnProps = UseQueryResult<string, Error>;

export const useTimestamps = ({ id, revision, enabled }: HookProps): ReturnProps => useQuery({
  queryKey: queryKeys.timestamps(id, revision),
  queryFn: ({ signal }) => apiClient.media.getTimestamps(id, signal),
  enabled,
  staleTime: Infinity,
});