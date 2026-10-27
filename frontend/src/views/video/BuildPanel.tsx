import { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/api/apiClient';
import Button from '@/components/ui/Button';
import type { VideoJob, VideoStatus, VideoStyleConfig } from '@/types/video.types';
import { videoText } from './consts/video-text.const';
import OutputPlayer from './OutputPlayer';

type BuildPanelProps = {
  projectId: string; style: VideoStyleConfig; status?: VideoStatus;
  refresh: () => Promise<unknown>; busy: boolean;
};

const BuildPanel = ({ projectId, style, status, refresh, busy }: BuildPanelProps) => {
  const [pending, setPending] = useState(false);
  const job = status?.job;
  const disabled = busy || pending;
  const buildLabel = status?.audio ? videoText.build : videoText.cycle;
  const elapsed = job ? Math.round((new Date(job.updatedAt).getTime() - new Date(job.startedAt).getTime()) / 1000) : 0;
  const stages = ['normalizing', 'planning', 'rendering_chunks', 'stitching', 'muxing'] as const;
  const estimate = (style.cycleTargetMinutes * 60 * 3000000 / 1073741824).toFixed(1);
  const run = async (kind: VideoJob['kind']) => {
    setPending(true);

    try {
      await apiClient.video.start(projectId, kind, style);
      await refresh();
    } catch { toast.error(videoText.error); } finally { setPending(false); }
  };
  const build = () => { run('build'); };
  const preview = () => { run('preview'); };
  const mux = () => { run('mux'); };
  const cancel = () => {
    if (job) {
      apiClient.video.cancel(projectId, job.jobId).then(refresh).catch(() => toast.error(videoText.error));
    }
  };
  const clear = () => { apiClient.video.clear(projectId).then(refresh).catch(() => toast.error(videoText.error)); };

  return (
    <section className="space-y-4">
      <p>{status?.audio ? videoText.audioReady : videoText.audioMissing} {status?.audio?.duration.toFixed(1)}s</p>
      <p className="text-sm text-muted-foreground">{videoText.loop}</p>
      <p className="text-sm">{videoText.estimate}: {estimate}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled} onClick={build}>{buildLabel}</Button>
        <Button disabled={disabled} variant="outline" onClick={preview}>{videoText.preview}</Button>
        {status?.cycle && status.audio && <Button disabled={disabled} onClick={mux}>{videoText.mux}</Button>}
        <Button disabled={disabled} variant="outline" onClick={clear}>{videoText.clear}</Button>
        {busy && <Button variant="outline" onClick={cancel}>{videoText.cancel}</Button>}
      </div>
      {job && <div className="space-y-2" aria-live="polite">
        <p>{videoText[job.stage]} · {Math.round(job.progress * 100)}% · {videoText.elapsed}: {elapsed}</p>
        <progress value={job.progress} max={1} className="w-full" aria-label={videoText.title} />
        <p>{job.message}</p>
        <ol className="flex flex-wrap gap-3 text-sm">{stages.map((stage) => <li key={stage}>{videoText[stage]}</li>)}</ol>
        {job.error && <details><summary>{videoText.details}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{job.error}</pre></details>}
        {job.stage === 'failed' && <Button disabled={disabled} onClick={build}>{videoText.retry}</Button>}
      </div>}
      {status?.preview && <OutputPlayer projectId={projectId} kind="preview" version={status.preview} />}
      {status?.cycle && <OutputPlayer projectId={projectId} kind="cycle" version={status.cycle.path} />}
      {status?.output && <OutputPlayer projectId={projectId} kind="final" version={status.output} />}
    </section>
  );
};

export default BuildPanel;