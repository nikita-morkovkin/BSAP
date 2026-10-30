import { apiClient } from "@/api/apiClient";
import Button from "@/components/ui/Button";
import type { StockClip } from "@/types/video.types";
import ClipEffects from "./ClipEffects";
import { videoText } from "./consts/video-text.const";

type ClipCardProps = {
  projectId: string;
  clip: StockClip;
  busy: boolean;
  onToggle: (clip: StockClip) => void;
  onDelete: (clip: StockClip) => void;
};

const ClipCard = ({
  projectId,
  clip,
  busy,
  onToggle,
  onDelete,
}: ClipCardProps) => {
  const thumbnail = apiClient.video.url(projectId, `clips/${clip.id}/thumb`);

  const toggle = () => {
    onToggle(clip);
  };

  const remove = () => {
    onDelete(clip);
  };

  const stretched = (clip.plannedDurationSec ?? 0) > clip.durationSec + 0.1;
  const status =
    clip.status === "ready"
      ? videoText.ready
      : clip.status === "invalid"
        ? videoText.invalid
        : videoText.processing;

  return (
    <article className="space-y-2 rounded-xl border p-3">
      <img
        src={thumbnail}
        alt={clip.originalName}
        loading="lazy"
        className="aspect-video w-full rounded object-cover"
      />
      <p className="truncate font-medium" title={clip.originalName}>
        {clip.originalName}
      </p>
      <p className="text-xs text-muted-foreground">
        {clip.durationSec.toFixed(1)}s · {clip.fps.toFixed(2)} fps ·{" "}
        {clip.width}×{clip.height}
      </p>
      <p className="text-xs">
        {status} {clip.vfr && videoText.vfr} {clip.invalidReason}
      </p>
      {stretched && (
        <p className="text-xs">
          {videoText.stretched} → {clip.plannedDurationSec?.toFixed(1)}s
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={clip.enabled}
          disabled={busy}
          onChange={toggle}
        />
        {videoText.enabled}
      </label>
      <Button variant="outline" size="sm" disabled={busy} onClick={remove}>
        {videoText.remove}
      </Button>
      <ClipEffects projectId={projectId} clipId={clip.id} busy={busy} />
    </article>
  );
};

export default ClipCard;
