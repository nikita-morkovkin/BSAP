import { useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/apiClient';
import type { GreetingConfig } from '@/types/greeting-config.type';
import Button from '@/components/ui/Button';
import CharacterLibrary from './CharacterLibrary';
import GreetingPlacement from './GreetingPlacement';
import GreetingWaveform from './GreetingWaveform';
import NativeGreetingClip from './NativeGreetingClip';

type GreetingPanelProps = { projectId: string; busy: boolean };

const GreetingPanel = ({ projectId, busy }: GreetingPanelProps) => {
  const query = useQuery({ queryKey: ['greeting', projectId], queryFn: () => apiClient.greeting.get(projectId), refetchInterval: 3000 });
  const [draft, setDraft] = useState<GreetingConfig | null>(null);
  const config = draft ?? query.data?.config;
  const change = (value: GreetingConfig) => { setDraft(value); };
  const text = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (config) {
      change({ ...config, text: event.target.value });
    }
  };
  const enabled = (event: ChangeEvent<HTMLInputElement>) => {
    if (config) {
      change({ ...config, enabled: event.target.checked });
    }
  };
  const mode = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (config && (value === 'vad_switch' || value === 'external_lipsync' || value === 'native_veo_audio')) {
      change({ ...config, lipSyncMode: value });
    }
  };
  const external = async () => {
    if (!window.confirm('Send the character and greeting audio to Sync? This is paid generation. Pricing depends on your Sync plan; check your account before confirming.')) {
      return;
    }

    try {
      await save();
      await apiClient.greeting.lipsync(projectId);
      toast.info('External generation queued. Failed jobs can be retried without resubmitting payment.');
    } catch { toast.error('External lip sync could not start; choose local voice activity mode.'); }
  };
  const fallback = async () => {
    if (!config) {
      return;
    }

    try {
      const local = { ...config, lipSyncMode: 'vad_switch' as const };

      await apiClient.greeting.save(projectId, local);
      setDraft(local);
      await query.refetch();
    } catch { toast.error('Could not switch to local mode'); }
  };
  const save = async () => {
    if (!config) {
      return;
    }

    await apiClient.greeting.save(projectId, config);
    await query.refetch();
    setDraft(null);
  };
  const saveClick = () => { save().catch(() => toast.error('Could not save greeting')); };
  const regenerate = async () => {
    try {
      await save();
      await apiClient.greeting.start(projectId, 'regenerate-audio');
      toast.info('Greeting generation queued; mix will rebuild once chapters are ready.');
    } catch { toast.error('Could not start greeting generation'); }
  };
  const preview = async () => {
    try {
      await save();
      await apiClient.greeting.start(projectId, 'preview');
    } catch { toast.error('Could not start greeting preview'); }
  };
  const url = apiClient.video.url(projectId, `greeting/preview?v=${encodeURIComponent(query.data?.preview ?? '')}`);
  const revision = JSON.stringify(query.data);
  const estimate = Math.ceil((config?.text.split(/\s+/).length ?? 0) / 2);

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h3 className="text-lg font-semibold">Mascot greeting</h3>
      {config && <>
        <label><input type="checkbox" checked={config.enabled} onChange={enabled} disabled={busy} /> Enable greeting</label>
        <p className="text-sm">Local matching is free and deterministic, not phoneme-accurate. Sync external lip sync costs money and needs a clear front-facing face; cartoon faces may fail. Native Veo audio uses a different voice from the narrator.</p>
        <label>Lip sync<select value={config.lipSyncMode} onChange={mode} disabled={busy}><option value="vad_switch">Match voice activity (local, free)</option><option value="external_lipsync">Sync lipsync-2 (paid, explicit confirmation)</option><option value="native_veo_audio">Use Veo's own voice (different narrator)</option></select></label>
        {config.lipSyncMode === 'native_veo_audio' && <NativeGreetingClip projectId={projectId} config={config} change={change} />}
        {config.lipSyncMode === 'external_lipsync' && <div className="flex gap-2"><Button disabled={busy} onClick={external}>Confirm paid external generation</Button><Button variant="outline" disabled={busy} onClick={fallback}>Switch to local (free)</Button></div>}
        <label className="block">Greeting text<textarea value={config.text} maxLength={2000} onChange={text} className="block min-h-24 w-full rounded border p-2" /></label>
        <p className="text-xs">{config.text.length}/2000 characters · approximately {estimate}s. Changing text invalidates greeting audio and the mix. Regeneration is explicit and prepends this separate segment to narration.</p>
        <GreetingPlacement config={config} change={change} />
        <div className="flex gap-2"><Button disabled={busy} onClick={saveClick}>Save settings</Button><Button disabled={busy} onClick={regenerate}>Regenerate greeting audio & rebuild mix</Button><Button disabled={busy} variant="outline" onClick={preview}>Preview greeting</Button></div>
        <CharacterLibrary projectId={projectId} busy={busy} />
        <GreetingWaveform projectId={projectId} revision={revision} />
        {query.data?.preview && <video src={url} controls preload="metadata" className="aspect-video w-full rounded bg-black object-contain" />}
      </>}
      {query.isError && <p role="alert">Could not load greeting settings.</p>}
    </section>
  );
};

export default GreetingPanel;