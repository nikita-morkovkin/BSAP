import { apiClient } from "@/api/apiClient";
import Button from "@/components/ui/Button";
import { useQuery } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import EffectCard from "./EffectCard";
import EffectPresets from "./EffectPresets";

type EffectsPanelProps = { projectId: string; busy: boolean };

const EffectsPanel = ({ projectId, busy }: EffectsPanelProps) => {
  const query = useQuery({
    queryKey: ["video-effects", projectId],
    queryFn: () => apiClient.effects.list(projectId),
    refetchInterval: 5000,
  });

  const [draft, setDraft] = useState<{
    effect: string;
    percent: number;
  } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedClips, setSelectedClips] = useState<string[]>([]);

  const clips = useQuery({
    queryKey: ["video-clips", projectId],
    queryFn: () => apiClient.video.clips(projectId),
    staleTime: 5000,
  });

  const effectId = draft?.effect ?? query.data?.rules?.defaultEffectId ?? "";
  const percent = draft?.percent ?? query.data?.rules?.applyToPercent ?? 0;
  const disabled = busy || uploading;
  const bulkDisabled = disabled || selectedClips.length === 0;

  const selectClips = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedClips(
      Array.from(event.target.selectedOptions, (option) => option.value),
    );
  };

  const bulk = async () => {
    try {
      await apiClient.effects.assign(
        projectId,
        selectedClips,
        effectId ? [effectId] : [],
      );
      refresh();
      toast.info(
        `${selectedClips.length} clips need normalization on the next build`,
      );
    } catch {
      toast.error("Bulk assignment failed");
    }
  };

  const refresh = () => {
    query.refetch();
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    setUploading(true);

    try {
      await apiClient.effects.upload(projectId, files);
      refresh();
    } catch {
      toast.error("Overlay upload failed (maximum ten minutes per file)");
    } finally {
      setUploading(false);
    }
  };

  const changeEffect = (event: ChangeEvent<HTMLSelectElement>) => {
    setDraft({ effect: event.target.value, percent });
  };

  const changePercent = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft({ effect: effectId, percent: Number(event.target.value) });
  };

  const saveRules = async () => {
    try {
      await apiClient.effects.rules(projectId, {
        defaultEffectId: effectId || undefined,
        applyToPercent: percent,
        seed: query.data?.rules?.seed ?? 1,
      });
      refresh();
    } catch {
      toast.error("Could not save rules");
    }
  };
  const reshuffle = async () => {
    try {
      await apiClient.effects.rules(projectId, {
        defaultEffectId: effectId || undefined,
        applyToPercent: percent,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      });
      refresh();
    } catch {
      toast.error("Could not reshuffle effects");
    }
  };

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="text-lg font-semibold">Particle / light effects</h3>
      <EffectPresets projectId={projectId} busy={disabled} />
      <p className="text-sm">
        Effects are baked per clip before the vignette and dissolve with
        footage. Only affected clips need normalization on the next build; no
        full-length video encode.
      </p>
      <label className="block text-sm">
        Upload overlay videos (black background or alpha)
        <input
          type="file"
          accept="video/*,.mov,.webm"
          multiple
          onChange={upload}
          disabled={disabled}
        />
      </label>
      {query.isError && <p role="alert">Could not load effects.</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {query.data?.effects.map((effect) => (
          <EffectCard
            key={effect.id}
            projectId={projectId}
            effect={effect}
            busy={disabled}
            refresh={refresh}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>
          Apply
          <select value={effectId} onChange={changeEffect}>
            <option value="">None</option>
            {query.data?.effects.map((effect) => (
              <option key={effect.id} value={effect.id}>
                {effect.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          to {percent}% of clips
          <input
            type="range"
            min="0"
            max="100"
            value={percent}
            onChange={changePercent}
          />
        </label>
        <Button disabled={disabled} onClick={saveRules}>
          Save rules
        </Button>
        <Button variant="outline" disabled={disabled} onClick={reshuffle}>
          Reshuffle
        </Button>
      </div>
      <p className="text-xs">
        Explicit per-clip assignments override percentage rules. Clear a clip to
        keep it free of effects.
      </p>
      <label className="block text-sm">
        Select clips for bulk assignment
        <select
          multiple
          value={selectedClips}
          onChange={selectClips}
          className="block w-full rounded border p-2"
        >
          {clips.data?.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.originalName}
            </option>
          ))}
        </select>
      </label>
      <Button variant="outline" disabled={bulkDisabled} onClick={bulk}>
        Apply chosen effect to selected clips / clear
      </Button>
    </section>
  );
};

export default EffectsPanel;
