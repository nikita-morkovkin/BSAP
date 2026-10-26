import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import { queryKeys } from '@/consts/query.consts';
import type { MusicCatalog } from '@/types/music.types';

type ReturnProps = UseQueryResult<MusicCatalog, Error>;

export const useMusic = (): ReturnProps => useQuery({
  queryKey: queryKeys.music,
  queryFn: ({ signal }) => apiClient.music.list(signal),
});