import { useCallback, useRef, useState } from 'react';
import { apiClient } from '@/api/apiClient';
import type { VideoUploadItem } from '@/types/video.types';
import { videoText } from '../consts/video-text.const';

type ReturnProps = {
  items: VideoUploadItem[];
  enqueue: (files: File[]) => void;
  retry: (id: string) => void;
};
type HookProps = { projectId: string; onUploaded: () => Promise<unknown> };

export const useClipUpload = ({ projectId, onUploaded }: HookProps): ReturnProps => {
  const [items, setItems] = useState<VideoUploadItem[]>([]);
  const queue = useRef<VideoUploadItem[]>([]);
  const active = useRef(0);
  const patch = useCallback((id: string, changes: Partial<VideoUploadItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }, []);
  const pump = () => {
    while (active.current < 3 && queue.current.length) {
      const item = queue.current.shift();

      if (!item) {
        break;
      }

      active.current += 1;

      patch(item.id, { status: 'uploading' });

      apiClient.video.upload(projectId, item.file, (progress) => patch(item.id, { progress })).then(async () => {
        patch(item.id, { status: 'done', progress: 1 });

        await onUploaded();
      }).catch((error: unknown) => {
        patch(item.id, { status: 'failed', error: error instanceof Error ? error.message : videoText.error });
      }).finally(() => {
        active.current -= 1;

        pump();
      });
    }
  };
  const enqueue = (files: File[]) => {
    const added: VideoUploadItem[] = files.map((file) => {
      const accepted = /\.(mp4|mov|mkv|webm|m4v)$/i.test(file.name);

      return { id: crypto.randomUUID(), file, progress: 0, status: accepted ? 'queued' : 'failed', error: accepted ? undefined : videoText.rejected };
    });

    setItems((current) => [...current, ...added]);
    queue.current.push(...added.filter((item) => item.status === 'queued'));

    pump();
  };
  const retry = (id: string) => {
    const item = items.find((entry) => entry.id === id);

    if (item) {
      queue.current.push(item);

      patch(id, { status: 'queued', error: undefined, progress: 0 });
      pump();
    }
  };

  return { items, enqueue, retry };
};