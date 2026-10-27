import Button from '@/components/ui/Button';
import type { MouseEvent } from 'react';
import type { VideoUploadItem } from '@/types/video.types';
import { videoText } from './consts/video-text.const';

type UploadQueueProps = { items: VideoUploadItem[]; onRetry: (id: string) => void };

const UploadQueue = ({ items, onRetry }: UploadQueueProps) => {
  const handleRetry = (event: MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.id;

    if (id) {
      onRetry(id);
    }
  };

  return (
    <div className="max-h-48 space-y-2 overflow-auto" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 text-sm">
          <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
          <progress max={1} value={item.progress} aria-label={item.file.name} />
          <span>{videoText[item.status]}</span>
          {item.error && <span className="text-destructive">{item.error}</span>}
          {item.status === 'failed' && <Button data-id={item.id} onClick={handleRetry}>{videoText.retry}</Button>}
        </div>
      ))}
    </div>
  );
};

export default UploadQueue;