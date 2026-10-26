import { useState } from 'react';
import MusicSelector from '@/components/music/MusicSelector';
import { useMusic } from '@/hooks/queries/useMusic.hook';
import { useProjectMusicMutation } from '@/hooks/mutations/useProjectMusicMutation.hook';
import type { ProjectState } from '@/types/project.types';
import type { MusicTrack } from '@/types/music.types';

type ProjectMusicPanelProps = { state: ProjectState; productionBusy?: boolean };

const ProjectMusicPanel = ({ state, productionBusy }: ProjectMusicPanelProps) => {
  const library = useMusic();
  const mutation = useProjectMusicMutation({ projectId: state.projectId });
  const [draft, setDraft] = useState<{ ids: string[]; revision: number } | null>(null);
  const saved = state.music;
  const selected = draft?.ids ?? saved?.selectedTrackIds ?? [];
  const dirty = draft !== null && (!saved || JSON.stringify(selected) !== JSON.stringify(saved.selectedTrackIds));
  const active = productionBusy || !['IDLE', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status);
  const disabled = active || mutation.isPending;
  const saveDisabled = disabled || !dirty;
  const chapters = Object.values(state.chapters);
  const remasterDisabled = disabled || dirty || !chapters.length || chapters.some((chapter) => chapter.ttsStatus !== 'COMPLETED');
  const snapshots: MusicTrack[] = (saved?.snapshots ?? []).map((snapshot) => ({
    ...snapshot, available: true,
  }));
  const tracks = [...snapshots, ...(library.data?.tracks ?? []).filter((track) => !snapshots.some((item) => item.id === track.id))];
  const handleSelection = (ids: string[]) => setDraft({ ids, revision: draft?.revision ?? saved?.revision ?? 0 });
  const handleSave = () => mutation.mutate({
    kind: 'save', revision: draft?.revision ?? saved?.revision ?? 0, selectedTrackIds: selected,
  }, { onSuccess: () => setDraft(null) });
  const handleDiscard = () => setDraft(null);
  const handleRemaster = () => mutation.mutate({ kind: 'remaster' });
  const handleRetry = () => { library.refetch(); };

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Project soundtrack</h2>
      {!saved && <p>Legacy soundtrack has not been resolved. Existing completed exports are unchanged.
        The next rebuild snapshots all valid library tracks unless you explicitly save a selection below.</p>}
      {saved && <p>Saved revision {saved.revision}. Saved project copies are independent of the library.</p>}
      {saved?.snapshots.map((snapshot) => {
        const current = library.data?.tracks.find((track) => track.id === snapshot.id);
        const status = !library.data ? 'Library status loading' : !current ? 'Library entry removed; project copy retained' :
          current.version !== snapshot.version ? 'New library version available; saved copy retained' : 'Saved library version';

        return <p key={snapshot.id} className="text-sm">{snapshot.displayName} · version {snapshot.version.slice(0, 8)} · {status}</p>;
      })}
      <p className="text-sm">To adopt a newer library version, explicitly remove the track and Save, then select it again and Save.
        Renaming or replacing library audio never substitutes a saved copy.</p>
      {library.isError && <p role="alert">Library could not load. Saved copies remain selected. <button onClick={handleRetry}>Retry</button></p>}
      <MusicSelector tracks={tracks} selected={selected} onChange={handleSelection} disabled={disabled} />
      {dirty && <p role="status">Unsaved soundtrack changes. Refetching does not overwrite your choices.</p>}
      {active && <p>Production is queued or active. Wait for it to finish before saving music or rebuilding.</p>}
      {state.mixNeedsRebuild && <p role="status">Soundtrack saved — mix needs a rebuild. Narration will not be regenerated.</p>}
      <div className="flex gap-4">
        <button type="button" onClick={handleSave} disabled={saveDisabled} className="rounded border p-2">Save soundtrack</button>
        <button type="button" onClick={handleDiscard} disabled={disabled} className="rounded border p-2">Discard local changes</button>
        <button type="button" onClick={handleRemaster} disabled={remasterDisabled} className="rounded border p-2">Rebuild mix</button>
      </div>
      {mutation.isPending && <p role="status">Saving request…</p>}
      {mutation.isError && <p role="alert">Request failed. Your local choices are retained; the saved soundtrack is unchanged. Refresh for conflicts or retry.</p>}
    </section>
  );
};

export default ProjectMusicPanel;