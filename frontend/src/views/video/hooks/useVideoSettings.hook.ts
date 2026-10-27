import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import type { VideoStyleConfig } from '@/types/video.types';
import { videoText } from '../consts/video-text.const';

type ReturnProps = {
  style?: VideoStyleConfig;
  change: (style: VideoStyleConfig) => void;
  error?: string;
};
type HookProps = { projectId: string };

export const useVideoSettings = ({ projectId }: HookProps): ReturnProps => {
  const query = useQuery({ queryKey: ['video-settings', projectId], queryFn: () => apiClient.video.settings(projectId) });
  const [draft, setDraft] = useState<VideoStyleConfig>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!draft) {
      return;
    }

    const abort = new AbortController();
    const timer = setTimeout(() => {
      apiClient.video.save(projectId, draft, abort.signal).then(() => setError(undefined)).catch(() => {
        if (!abort.signal.aborted) {
          setError(videoText.saveError);
        }
      });
    }, 500);

    return () => { clearTimeout(timer); abort.abort(); };
  }, [projectId, draft]);

  return { style: draft ?? query.data, change: setDraft, error };
};