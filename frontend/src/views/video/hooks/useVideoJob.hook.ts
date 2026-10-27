import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import type { VideoStatus } from '@/types/video.types';

type ReturnProps = { status?: VideoStatus; refresh: () => Promise<unknown> };
type HookProps = { projectId: string };

export const useVideoJob = ({ projectId }: HookProps): ReturnProps => {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['video-status', projectId], queryFn: () => apiClient.video.status(projectId), refetchInterval: 2000 });
  const jobId = query.data?.job?.jobId;
  const stage = query.data?.job?.stage;

  useEffect(() => {
    if (!jobId || !stage || ['done', 'failed', 'cancelled'].includes(stage)) {
      return;
    }

    const events = new EventSource(apiClient.video.url(projectId, `jobs/${jobId}/events`));

    events.onmessage = (event) => {
      try {
        const job = JSON.parse(event.data);

        client.setQueryData<VideoStatus>(['video-status', projectId], (previous) => previous ? { ...previous, job } : previous);
      } catch {
        events.close();
      }
    };
    events.onerror = () => events.close();

    return () => events.close();
  }, [projectId, jobId, stage, client]);

  return { status: query.data, refresh: query.refetch };
};