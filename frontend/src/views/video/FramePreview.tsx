import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/apiClient';
import type { VideoStyleConfig } from '@/types/video.types';
import { useFramePreview } from './hooks/useFramePreview.hook';
import { videoText } from './consts/video-text.const';

type FramePreviewProps = { projectId: string; style: VideoStyleConfig };

const FramePreview = ({ projectId, style }: FramePreviewProps) => {
  const query = useQuery({ queryKey: ['video-clips', projectId], queryFn: () => apiClient.video.clips(projectId) });
  const [sample, setSample] = useState('');
  const clipId = sample || query.data?.[0]?.id;
  const frame = useFramePreview({ projectId, clipId, style });
  const original = clipId ? apiClient.video.url(projectId, `clips/${clipId}/thumb`) : undefined;
  const changeSample = (event: ChangeEvent<HTMLSelectElement>) => { setSample(event.target.value); };

  return (
    <section className="space-y-3">
      <label>{videoText.sample} <select value={clipId} onChange={changeSample}>
        {query.data?.map((clip) => <option key={clip.id} value={clip.id}>{clip.originalName}</option>)}
      </select></label>
      <div className="grid grid-cols-2 gap-3">
        {original && <figure><img src={original} alt={videoText.original} className="w-full rounded" /><figcaption>{videoText.original}</figcaption></figure>}
        {frame.url && <figure><img src={frame.url} alt={videoText.graded} className="w-full rounded" /><figcaption>{videoText.graded}</figcaption></figure>}
      </div>
      {frame.error && <p role="alert">{frame.error}</p>}
    </section>
  );
};

export default FramePreview;