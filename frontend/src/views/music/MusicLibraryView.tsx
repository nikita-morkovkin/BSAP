import { useMusic } from "@/hooks/queries/useMusic.hook";
import MusicTrackRow from "./MusicTrackRow";
import MusicUploadForm from "./MusicUploadForm";

const MusicLibraryView = () => {
  const query = useMusic();

  const handleRetry = () => {
    query.refetch();
  };

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold">Music Library</h1>
      <p>
        Reusable WAV and MP3 sources. Replacing, renaming, or deleting a library
        entry never changes existing project copies. New uploads are not
        automatically selected in saved projects or your unsaved form.
      </p>
      <MusicUploadForm />
      {query.isPending && <p role="status">Loading music…</p>}
      {query.isError && (
        <p role="alert">
          Could not load music. <button onClick={handleRetry}>Retry</button>
        </p>
      )}
      {query.data?.importErrors.map((error) => (
        <p role="alert" key={error.filename}>
          {error.filename}: {error.message}
        </p>
      ))}
      {query.data?.tracks.map((track) => (
        <MusicTrackRow key={track.id} track={track} />
      ))}
      {query.data?.tracks.length === 0 && (
        <p>No music yet. Upload a WAV or MP3 to begin.</p>
      )}
    </section>
  );
};

export default MusicLibraryView;
