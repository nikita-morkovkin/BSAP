import QueryFeedback from "@/components/common/QueryFeedback";
import { useDownloadsPanel } from "./hooks/useDownloadsPanel.hook";
import ChapterDownload from "./ChapterDownload";
import DownloadLink from "./DownloadLink";
import TimestampsBox from "./TimestampsBox";

type DownloadsPanelProps = { projectId: string };

const DownloadsPanel = ({ projectId }: DownloadsPanelProps) => {
  const { query, handleRetry, data } = useDownloadsPanel({ projectId });

  if (!data) {
    return (
      <QueryFeedback
        error={query.isError}
        message="Loading production exports…"
        onRetry={handleRetry}
      />
    );
  }

  const {
    state,
    projectTitle,
    chapters,
    flacUrl,
    wavUrl,
    narrationUrl,
    hasNarration,
    backgroundMusicUrl,
    timestampsUrl,
    markersUrl,
    hasFlac,
    hasWav,
    hasTimestamps,
    hasMarkers,
    hasBackgroundMusic,
  } = data;

  return (
    <section className="space-y-6">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Production export
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Ready for a quieter world.
        </h1>
        <p className="mt-3 text-muted-foreground">{projectTitle}</p>
      </header>
      {query.isError && (
        <QueryFeedback
          error
          message="Connection interrupted. Export availability may be out of date."
          onRetry={handleRetry}
        />
      )}
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Master artifacts</h2>
        <p className="text-sm text-muted-foreground">
          Downloads stream directly to your browser, without loading long audio
          files into application memory. Unavailable artifacts unlock after
          mastering.
        </p>
        <div className="flex flex-wrap gap-3">
          <DownloadLink
            url={narrationUrl}
            label="Download Voiceover Only (.WAV)"
            available={hasNarration}
          />
          <DownloadLink
            url={flacUrl}
            label="Download Master Audio (.FLAC)"
            available={hasFlac}
          />
          <DownloadLink
            url={wavUrl}
            label="Download Master Audio (.WAV)"
            available={hasWav}
          />
          <DownloadLink
            url={timestampsUrl}
            label="Download YouTube Timestamps (.TXT)"
            available={hasTimestamps}
          />
          <DownloadLink
            url={markersUrl}
            label="Download NLE Timeline Markers (.CSV)"
            available={hasMarkers}
          />
          <DownloadLink
            url={backgroundMusicUrl}
            label="Download Background Music Only (.WAV)"
            available={hasBackgroundMusic}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Voiceover only contains the assembled narration with chapter and chunk
          pauses, without background music or the final mastering chain,
          padding, and fade-out. Music-level changes do not alter this source.
        </p>
        <TimestampsBox
          projectId={projectId}
          revision={state.updatedAt}
          available={hasTimestamps}
        />
      </div>
      <h2 className="text-xl font-semibold">Individual chapters</h2>
      <ul className="space-y-3">
        {chapters.map((chapter) => (
          <ChapterDownload
            key={chapter.chapterNumber}
            projectId={projectId}
            chapter={chapter}
          />
        ))}
      </ul>
      {chapters.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Chapter downloads appear after narration is assembled.
        </p>
      )}
    </section>
  );
};

export default DownloadsPanel;
