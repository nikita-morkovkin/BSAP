import { apiClient } from "@/api/apiClient";
import { videoText } from "./consts/video-text.const";

type OutputPlayerProps = {
  projectId: string;
  kind: "preview" | "cycle" | "final";
  version: string;
};

const OutputPlayer = ({ projectId, kind, version }: OutputPlayerProps) => {
  const url = apiClient.video.url(
    projectId,
    `output?kind=${kind}&v=${encodeURIComponent(version)}`,
  );

  const label =
    kind === "preview"
      ? videoText.previewOutput
      : kind === "cycle"
        ? videoText.cycleOutput
        : videoText.output;
  const downloadLabel =
    kind === "cycle" ? "Download loop MP4" : videoText.download;

  return (
    <figure className="space-y-2">
      <figcaption className="font-medium">{label}</figcaption>
      {kind === "cycle" && (
        <p className="text-sm text-muted-foreground">
          This silent loop is the building block, repeated to narration length.
          Download the full-length silent track in Exports.
        </p>
      )}
      <video
        key={url}
        src={url}
        controls
        preload="metadata"
        className="aspect-video w-full rounded-xl bg-black object-contain"
        aria-label={label}
      />
      <a href={url} download className="text-sm underline">
        {downloadLabel}
      </a>
    </figure>
  );
};

export default OutputPlayer;
