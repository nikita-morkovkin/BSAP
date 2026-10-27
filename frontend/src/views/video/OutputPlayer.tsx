import { apiClient } from '@/api/apiClient';
import { videoText } from './consts/video-text.const';

type OutputPlayerProps = { projectId: string; kind: 'preview' | 'cycle' | 'final'; version: string };

const OutputPlayer = ({ projectId, kind, version }: OutputPlayerProps) => {
  const url = apiClient.video.url(projectId, `output?kind=${kind}&v=${encodeURIComponent(version)}`);
  const label = kind === 'preview' ? videoText.previewOutput : kind === 'cycle' ? videoText.cycleOutput : videoText.output;

  return (
    <figure className="space-y-2">
      <figcaption className="font-medium">{label}</figcaption>
      <video key={url} src={url} controls preload="metadata" className="max-h-96 w-full rounded-xl bg-black" aria-label={label} />
      <a href={url} download className="text-sm underline">{videoText.download}</a>
    </figure>
  );
};

export default OutputPlayer;