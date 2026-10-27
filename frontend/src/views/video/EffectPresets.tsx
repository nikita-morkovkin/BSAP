import { apiClient } from "@/api/apiClient";
import Button from "@/components/ui/Button";
import type { EffectPreset } from "@/types/effect-preset.type";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";

type EffectPresetsProps = { projectId: string; busy: boolean };

const EffectPresets = ({ projectId, busy }: EffectPresetsProps) => {
  const [kind, setKind] = useState<EffectPreset>("marine_snow");
  const [seed, setSeed] = useState(1);

  const changeKind = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (
      value === "marine_snow" ||
      value === "bubbles_rising" ||
      value === "light_rays" ||
      value === "dust_motes" ||
      value === "plankton_sparkle"
    ) {
      setKind(value);
    }
  };
  const changeSeed = (event: ChangeEvent<HTMLInputElement>) => {
    setSeed(Number(event.target.value));
  };
  const generate = async () => {
    try {
      await apiClient.effects.preset(projectId, kind, seed);
      toast.info(
        "Preset generation queued. It will appear in the effect library.",
      );
    } catch {
      toast.error("Could not start preset generation");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label>
        Preset
        <select value={kind} onChange={changeKind}>
          <option value="marine_snow">Marine snow</option>
          <option value="bubbles_rising">Rising bubbles</option>
          <option value="light_rays">Light rays</option>
          <option value="dust_motes">Dust motes</option>
          <option value="plankton_sparkle">Plankton sparkle</option>
        </select>
      </label>
      <label>
        Seed
        <input
          type="number"
          min="0"
          max="4294967295"
          step="1"
          value={seed}
          onChange={changeSeed}
        />
      </label>
      <Button variant="outline" onClick={generate} disabled={busy}>
        Add preset
      </Button>
    </div>
  );
};

export default EffectPresets;
