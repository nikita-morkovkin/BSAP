import { useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/apiClient';
import Button from '@/components/ui/Button';
import { veoPrompts } from './consts/veo-prompts.const';
import CharacterClipCard from './CharacterClipCard';

type CharacterLibraryProps = { projectId: string; busy: boolean };

const CharacterLibrary = ({ projectId, busy }: CharacterLibraryProps) => {
  const clips = useQuery({ queryKey: ['character-clips', projectId], queryFn: () => apiClient.greeting.clips(projectId) });
  const [prompts, setPrompts] = useState(veoPrompts);
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      await apiClient.greeting.upload(projectId, Array.from(event.target.files ?? []));
      await clips.refetch();
    } catch { toast.error('Character upload failed'); }
  };
  const refresh = () => { clips.refetch(); };
  const idle = (event: ChangeEvent<HTMLTextAreaElement>) => { setPrompts((current) => ({ ...current, idle: event.target.value })); };
  const talk = (event: ChangeEvent<HTMLTextAreaElement>) => { setPrompts((current) => ({ ...current, talk: event.target.value })); };
  const copyIdle = () => { navigator.clipboard.writeText(prompts.idle).catch(() => toast.error('Clipboard unavailable')); };
  const copyTalk = () => { navigator.clipboard.writeText(prompts.talk).catch(() => toast.error('Clipboard unavailable')); };

  return (
    <section className="space-y-3">
      <label>Upload Veo character videos<input type="file" accept="video/*" multiple onChange={upload} disabled={busy} /></label>
      <p className="text-xs">Use the same reference image, framing, neutral start/end pose, seed and style for both clips. The app does not call Veo.</p>
      {(clips.data?.length ?? 0) === 1 && <p className="text-sm text-amber-600">Single-source mode has lower quality: pauses loop the first second instead of matching a neutral idle pose.</p>}
      <div className="grid gap-3 md:grid-cols-3">{clips.data?.map((clip) => <CharacterClipCard key={clip.id} projectId={projectId} clip={clip} busy={busy} refresh={refresh} />)}</div>
      <details><summary>Editable Veo prompt helpers</summary>
        <label className="block">Idle<textarea value={prompts.idle} onChange={idle} className="w-full border p-2" /></label><Button size="sm" onClick={copyIdle}>Copy idle prompt</Button>
        <label className="block">Talk<textarea value={prompts.talk} onChange={talk} className="w-full border p-2" /></label><Button size="sm" onClick={copyTalk}>Copy talk prompt</Button>
      </details>
    </section>
  );
};

export default CharacterLibrary;