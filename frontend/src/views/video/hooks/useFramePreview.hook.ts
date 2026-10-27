import { useEffect, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import type { VideoStyleConfig } from '@/types/video.types';
import { videoText } from '../consts/video-text.const';

type ReturnProps = { url?: string; error?: string };
type HookProps = { projectId: string; clipId?: string; style: VideoStyleConfig };

export const useFramePreview = ({ projectId, clipId, style }: HookProps): ReturnProps => {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!clipId) {
      return;
    }

    const abort = new AbortController();
    let objectUrl: string | undefined;
    const timer = setTimeout(() => {
      apiClient.video.frame(projectId, style, clipId, abort.signal).then((blob) => {
        if (!abort.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);

          setUrl(objectUrl);
          setError(undefined);
        }
      }).catch(() => {
        if (!abort.signal.aborted) {
          setError(videoText.error);
        }
      });
    }, 300);

    return () => {
      clearTimeout(timer);
      abort.abort();

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [projectId, clipId, style]);

  return { url, error };
};