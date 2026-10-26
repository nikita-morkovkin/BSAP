import Input from "@/components/ui/Input";
import { useMusicMutation } from "@/hooks/mutations/useMusicMutation.hook";
import type { MusicTrack } from "@/types/music.types";
import { useState, type ChangeEvent } from "react";

type MusicTrackRowProps = { track: MusicTrack };

const MusicTrackRow = ({ track }: MusicTrackRowProps) => {
  const mutation = useMusicMutation();
  const [name, setName] = useState(track.displayName);

  const handleName = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  };

  const handleSave = () => {
    mutation.mutate({ kind: "rename", id: track.id, displayName: name });
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Delete ${track.displayName} from the library? Existing project copies will not be deleted.`,
      )
    ) {
      mutation.mutate({ kind: "delete", id: track.id });
    }
  };

  const handleReplace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      mutation.mutate({ kind: "replace", id: track.id, file });
    }

    event.target.value = "";
  };

  return (
    <article className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{track.displayName}</h2>
      <p>
        {track.originalFilename} · {Math.round(track.durationSeconds)} s ·{" "}
        {(track.sizeBytes / 1048576).toFixed(2)} MiB
      </p>
      <p>{track.available ? "Available" : track.availabilityError}</p>
      <fieldset
        disabled={mutation.isPending}
        className="flex flex-wrap items-center gap-3"
      >
        <legend className="sr-only">Manage {track.displayName}</legend>
        <label>
          Display name
          <Input
            value={name}
            maxLength={160}
            onChange={handleName}
            className="ml-2 rounded border p-2"
          />
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim()}
          className="underline"
        >
          Save name
        </button>
        <label>
          Replace WAV or MP3
          <Input
            type="file"
            accept=".wav,.mp3,audio/wav,audio/mpeg"
            onChange={handleReplace}
            className="block"
          />
        </label>
        <button type="button" onClick={handleDelete} className="underline">
          Delete
        </button>
      </fieldset>
      {mutation.isPending && <p role="status">Saving and validating…</p>}
      {mutation.isError && (
        <p role="alert">
          Action failed. Your saved track was not changed. Check the API error
          details.
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status">
          Library updated. Existing project copies are unchanged.
        </p>
      )}
    </article>
  );
};

export default MusicTrackRow;
