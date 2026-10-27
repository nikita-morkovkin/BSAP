import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/apiClient';
import Button from '@/components/ui/Button';
import type { StockClip } from '@/types/video.types';
import ClipDropzone from './ClipDropzone';
import ClipCard from './ClipCard';
import UploadQueue from './UploadQueue';
import { useClipUpload } from './hooks/useClipUpload.hook';
import { videoText } from './consts/video-text.const';

type StockLibraryProps = { projectId: string; busy: boolean };

const StockLibrary = ({ projectId, busy }: StockLibraryProps) => {
  const client = useQueryClient();
  const queryKey = ['video-clips', projectId];
  const query = useQuery({ queryKey, queryFn: () => apiClient.video.clips(projectId), refetchInterval: 5000 });
  const upload = useClipUpload({ projectId, onUploaded: query.refetch });
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState('name');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const clips = query.data ?? [];
  const sorted = [...clips].filter((clip) => !enabledOnly || clip.enabled).sort((a, b) => sort === 'duration' ? a.durationSec - b.durationSec : a.originalName.localeCompare(b.originalName));
  const maxPage = Math.max(0, Math.ceil(sorted.length / 24) - 1);
  const currentPage = Math.min(page, maxPage);
  const visible = sorted.slice(currentPage * 24, (currentPage + 1) * 24);
  const source = clips.reduce((sum, clip) => sum + clip.durationSec, 0) / 60;
  const effective = clips.filter((clip) => clip.enabled).reduce((sum, clip) => sum + (clip.plannedDurationSec ?? clip.durationSec), 0) / 60;
  const handleError = () => { toast.error(videoText.error); };
  const toggle = async (clip: StockClip) => {
    await client.cancelQueries({ queryKey });

    const previous = client.getQueryData<StockClip[]>(queryKey);

    client.setQueryData<StockClip[]>(queryKey, (current) => current?.map((item) => item.id === clip.id ? { ...item, enabled: !item.enabled } : item));

    try {
      await apiClient.video.toggle(projectId, clip.id, !clip.enabled);
    } catch {
      client.setQueryData(queryKey, previous);

      handleError();
    }
  };
  const remove = (clip: StockClip) => {
    apiClient.video.delete(projectId, clip.id).then(() => query.refetch()).catch(handleError);
  };
  const bulk = async (enabled: boolean) => {
    try {
      for (const clip of clips) {
        if (clip.enabled !== enabled) {
          await apiClient.video.toggle(projectId, clip.id, enabled);
        }
      }

      await query.refetch();
    } catch { handleError(); }
  };
  const enableAll = () => { bulk(true); };
  const disableAll = () => { bulk(false); };
  const next = () => { setPage(currentPage + 1); };
  const previous = () => { setPage(Math.max(0, currentPage - 1)); };
  const changeSort = (event: ChangeEvent<HTMLSelectElement>) => { setSort(event.target.value); };
  const changeFilter = (event: ChangeEvent<HTMLInputElement>) => { setEnabledOnly(event.target.checked); };
  const firstPage = currentPage === 0;
  const lastPage = currentPage === maxPage;

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">{videoText.library}</h3>
      <p className="text-sm">{clips.length} {videoText.clips} · {source.toFixed(1)} {videoText.source} · {effective.toFixed(1)} {videoText.effective}</p>
      <ClipDropzone onFiles={upload.enqueue} />
      <UploadQueue items={upload.items} onRetry={upload.retry} />
      <div className="flex flex-wrap items-center gap-3">
        <label>{videoText.sort} <select value={sort} onChange={changeSort}><option value="name">{videoText.name}</option><option value="duration">{videoText.duration}</option></select></label>
        <label><input type="checkbox" checked={enabledOnly} onChange={changeFilter} /> {videoText.active}</label>
        <Button variant="outline" disabled={busy} onClick={enableAll}>{videoText.enableAll}</Button>
        <Button variant="outline" disabled={busy} onClick={disableAll}>{videoText.disableAll}</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {visible.map((clip) => <ClipCard key={clip.id} projectId={projectId} clip={clip} busy={busy} onToggle={toggle} onDelete={remove} />)}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={firstPage} onClick={previous}>←</Button>
        <span>{videoText.page} {currentPage + 1} / {maxPage + 1}</span>
        <Button variant="outline" disabled={lastPage} onClick={next}>→</Button>
      </div>
    </section>
  );
};

export default StockLibrary;