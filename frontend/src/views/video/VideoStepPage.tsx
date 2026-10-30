import BuildPanel from "./BuildPanel";
import { videoText } from "./consts/video-text.const";
import EffectsPanel from "./EffectsPanel";
import FramePreview from "./FramePreview";
import { useVideoJob } from "./hooks/useVideoJob.hook";
import { useVideoSettings } from "./hooks/useVideoSettings.hook";
import StockLibrary from "./StockLibrary";
import StyleSettingsPanel from "./StyleSettingsPanel";

type VideoStepPageProps = { projectId: string };

const VideoStepPage = ({ projectId }: VideoStepPageProps) => {
  const settings = useVideoSettings({ projectId });
  const { status, refresh } = useVideoJob({ projectId });

  const busy = Boolean(
    status?.job && !["done", "failed", "cancelled"].includes(status.job.stage),
  );

  return (
    <details className="space-y-6 rounded-2xl border p-5">
      <summary className="cursor-pointer text-xl font-semibold">
        {videoText.title}
      </summary>
      <StockLibrary projectId={projectId} busy={busy} />
      <EffectsPanel projectId={projectId} busy={busy} />
      {settings.error && (
        <p role="alert" className="text-destructive">
          {settings.error}
        </p>
      )}
      {settings.style ? (
        <>
          <StyleSettingsPanel
            style={settings.style}
            onChange={settings.change}
          />
          <FramePreview projectId={projectId} style={settings.style} />
          <BuildPanel
            projectId={projectId}
            style={settings.style}
            status={status}
            refresh={refresh}
            busy={busy}
          />
        </>
      ) : (
        <p>{videoText.loading}</p>
      )}
    </details>
  );
};

export default VideoStepPage;
