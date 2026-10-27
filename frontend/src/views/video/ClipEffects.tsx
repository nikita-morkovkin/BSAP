import { apiClient } from "@/api/apiClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangeEvent } from "react";
import { toast } from "sonner";

type ClipEffectsProps = { projectId: string; clipId: string; busy: boolean };

const ClipEffects = ({ projectId, clipId, busy }: ClipEffectsProps) => {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ["video-effects", projectId],
    queryFn: () => apiClient.effects.list(projectId),
    staleTime: 3000,
  });

  const selected = query.data?.assignments[clipId]?.[0] ?? "";

  const assign = async (event: ChangeEvent<HTMLSelectElement>) => {
    try {
      await apiClient.effects.assign(
        projectId,
        [clipId],
        event.target.value ? [event.target.value] : [],
      );
      await client.invalidateQueries({
        queryKey: ["video-effects", projectId],
      });
      toast.info("Clip will be re-normalized on the next build");
    } catch {
      toast.error("Effect assignment failed");
    }
  };

  return (
    <label className="block text-xs">
      Effect
      <select value={selected} onChange={assign} disabled={busy}>
        <option value="">Clear / no explicit effect</option>
        {query.data?.effects.map((effect) => (
          <option key={effect.id} value={effect.id}>
            {effect.name}
          </option>
        ))}
      </select>
    </label>
  );
};

export default ClipEffects;
