import type { ChangeEvent } from 'react';
import type { MusicTrack } from '@/types/music.types';
import { toggleMusicSelection } from '@/utils/music-selection.util';

type MusicSelectorProps = {
  tracks: MusicTrack[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

const MusicSelector = ({ tracks, selected, onChange, disabled = false }: MusicSelectorProps) => {
  const displayedIds = tracks.map((track) => track.id);
  const handleAll = () => onChange(tracks.filter((track) => track.available).map((track) => track.id));
  const handleClear = () => onChange([]);
  const handleToggle = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(toggleMusicSelection(selected, event.target.value, event.target.checked, displayedIds));
  };

  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-xl border p-4">
      <legend className="px-2 font-semibold">Soundtrack inclusion</legend>
      <p>{selected.length} selected · Playback follows the displayed order.</p>
      <div className="flex gap-4">
        <button type="button" onClick={handleAll} className="underline">Select all</button>
        <button type="button" onClick={handleClear} className="underline">Clear all</button>
      </div>
      {tracks.map((track) => {
        const checked = selected.includes(track.id);
        const unavailable = !track.available && !checked;

        return (
          <label key={track.id} className="flex items-start gap-3 rounded border p-3">
            <input type="checkbox" value={track.id} checked={checked} disabled={unavailable}
              onChange={handleToggle} className="mt-1 size-4" />
            <span>Include {track.displayName} in production
              <small className="block">{track.originalFilename} · {Math.round(track.durationSeconds)} s
                {!track.available && ' · Unavailable in library'}</small>
            </span>
          </label>
        );
      })}
      {selected.length === 0 && <p role="status">Narration only — no background music will be mixed.</p>}
    </fieldset>
  );
};

export default MusicSelector;