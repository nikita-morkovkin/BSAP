import { useQuery } from '@tanstack/react-query';
import type { ChangeEvent } from 'react';
import { apiClient } from '@/api/apiClient';
import type { GreetingConfig } from '@/types/greeting-config.type';

type NativeGreetingClipProps = { projectId: string; config: GreetingConfig; change: (config: GreetingConfig) => void };

const NativeGreetingClip = ({ projectId, config, change }: NativeGreetingClipProps) => {
  const query = useQuery({ queryKey: ['character-clips', projectId], queryFn: () => apiClient.greeting.clips(projectId) });
  const select = (event: ChangeEvent<HTMLSelectElement>) => { change({ ...config, nativeClipId: event.target.value || undefined }); };
  const selected = config.nativeClipId ?? '';

  return <label className="block text-sm">Native greeting source (voice differs from narrator)<select value={selected} onChange={select}><option value="">Select a clip containing audio</option>{query.data?.filter((clip) => clip.hasAudio).map((clip) => <option key={clip.id} value={clip.id}>{clip.originalName}</option>)}</select></label>;
};

export default NativeGreetingClip;