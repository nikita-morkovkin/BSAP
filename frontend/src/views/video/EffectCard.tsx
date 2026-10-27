import { apiClient } from "@/api/apiClient";
import Button from "@/components/ui/Button";
import type { VideoEffect } from "@/types/video-effect.type";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";

type EffectCardProps = {
  projectId: string;
  effect: VideoEffect;
  busy: boolean;
  refresh: () => void;
};

const EffectCard = ({ projectId, effect, busy, refresh }: EffectCardProps) => {
  const [draft, setDraft] = useState(effect);
  const change = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;

    setDraft((current) => ({
      ...current,
      [name]: ["name", "blend"].includes(name) ? value : Number(value),
    }));
  };
  const save = async () => {
    try {
      await apiClient.effects.edit(projectId, draft);
      refresh();
    } catch {
      toast.error("Could not save effect");
    }
  };
  const remove = async () => {
    try {
      await apiClient.effects.remove(projectId, effect.id);
      refresh();
    } catch {
      toast.error("Could not delete effect");
    }
  };
  const url = apiClient.video.url(projectId, `effects/${effect.id}/preview`);

  return (
    <article className="space-y-2 rounded-xl border p-3">
      <video
        src={url}
        muted
        loop
        controls
        preload="metadata"
        className="aspect-video w-full rounded object-contain"
      />
      <p className="text-xs">
        {effect.source} · {effect.durationSec.toFixed(1)} s{" "}
        {effect.hasAlpha && "· alpha"}
      </p>
      <label className="block text-xs">
        Name
        <input
          name="name"
          value={draft.name}
          onChange={change}
          className="w-full border p-1"
        />
      </label>
      <label className="block text-xs">
        Blend
        <select name="blend" value={draft.blend} onChange={change}>
          <option value="screen">Screen</option>
          <option value="add">Add</option>
          <option value="overlay_alpha">Alpha</option>
        </select>
      </label>
      <label className="block text-xs">
        Opacity
        <input
          name="opacity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={draft.opacity}
          onChange={change}
        />
      </label>
      <label className="block text-xs">
        Speed
        <input
          name="speed"
          type="number"
          min="0.25"
          max="2"
          step="0.05"
          value={draft.speed}
          onChange={change}
        />
      </label>
      <label className="block text-xs">
        Scale
        <input
          name="scale"
          type="number"
          min="0.5"
          max="2"
          step="0.1"
          value={draft.scale}
          onChange={change}
        />
      </label>
      <label className="block text-xs">
        Brightness cap
        <input
          name="maxBrightness"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={draft.maxBrightness}
          onChange={change}
        />
      </label>
      <Button size="sm" disabled={busy} onClick={save}>
        Save
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={remove}>
        Delete
      </Button>
    </article>
  );
};

export default EffectCard;
