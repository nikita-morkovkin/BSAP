import { apiClient } from "@/api/apiClient";
import Button from "@/components/ui/Button";
import type { CharacterClip } from "@/types/character-clip.type";
import type { ChangeEvent } from "react";
import { toast } from "sonner";

type CharacterClipCardProps = {
  projectId: string;
  clip: CharacterClip;
  busy: boolean;
  refresh: () => void;
};

const CharacterClipCard = ({
  projectId,
  clip,
  busy,
  refresh,
}: CharacterClipCardProps) => {
  const url = apiClient.video.url(
    projectId,
    `character/clips/${clip.id}/thumb`,
  );

  const role = async (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (value !== "idle" && value !== "talk" && value !== "greeting_source") {
      return;
    }

    try {
      await apiClient.greeting.role(projectId, clip.id, value);
      refresh();
    } catch {
      toast.error("Could not change character role");
    }
  };

  const remove = async () => {
    try {
      await apiClient.greeting.remove(projectId, clip.id);
      refresh();
    } catch {
      toast.error("Could not delete character clip");
    }
  };

  const selected = clip.role ?? "greeting_source";

  return (
    <article className="space-y-2 rounded-xl border p-3">
      <img
        src={url}
        alt={clip.originalName}
        className="aspect-video w-full rounded object-contain"
      />
      <p className="text-sm">
        {clip.originalName} · {clip.durationSec.toFixed(1)}s · {clip.width}×
        {clip.height} · {clip.fps.toFixed(1)}fps
      </p>
      {clip.hasAudio && (
        <p className="text-xs">
          Veo audio will be ignored; the narrator voice is used.
        </p>
      )}
      <select
        aria-label="Character role"
        value={selected}
        onChange={role}
        disabled={busy}
      >
        <option value="greeting_source">Single source</option>
        <option value="idle">Idle</option>
        <option value="talk">Talk</option>
      </select>
      <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
        Delete
      </Button>
    </article>
  );
};

export default CharacterClipCard;
