import { apiClient } from "@/api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useClock } from "@/hooks/useClock.hook";
import {
  approximateJobEta,
  formatApproximateJobEta,
} from "@/utils/approximate-job-eta";
import ExportRow from "./ExportRow";

type ExportsPanelProps = { projectId: string };

const ExportsPanel = ({ projectId }: ExportsPanelProps) => {
  const [selected, setSelected] = useState<string[]>([]);
  const now = useClock();
  const query = useQuery({
    queryKey: ["exports", projectId],
    queryFn: () => apiClient.exports.list(projectId),
    refetchInterval: 3000,
  });

  const toggle = (kind: string) => {
    setSelected((current) =>
      current.includes(kind)
        ? current.filter((value) => value !== kind)
        : [...current, kind],
    );
  };

  const refresh = () => {
    query.refetch();
  };

  const artifacts = query.data ?? [];
  const downloadable = selected.filter((kind) =>
    artifacts.some(
      (artifact) =>
        artifact.kind === kind && artifact.available && !artifact.stale,
    ),
  );

  const zip = apiClient.exports.zip(projectId, downloadable);
  const size = artifacts
    .filter((artifact) => downloadable.includes(artifact.kind))
    .reduce((sum, artifact) => sum + (artifact.sizeBytes ?? 0), 0);

  const audioDuration = artifacts.find(
    (artifact) => artifact.kind === "mixed_audio",
  )?.durationSec;

  const video = useQuery({
    queryKey: ["video-status", projectId],
    queryFn: () => apiClient.video.status(projectId),
    refetchInterval: 3000,
  });

  const job = video.data?.job;
  const active = job && !["done", "failed", "cancelled"].includes(job.stage);
  const eta = active
    ? approximateJobEta(job.startedAt, job.progress, now)
    : undefined;
  const cancel = async () => {
    if (job) {
      try {
        await apiClient.video.cancel(projectId, job.jobId);
        await video.refetch();
      } catch {
        toast.error("Could not cancel the video job");
      }
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border p-5">
      <h3 className="text-lg font-semibold">Exports</h3>
      <p className="text-sm text-muted-foreground">
        Separate voice, music, mix and video downloads. FLAC is lossless; WAV
        can exceed 3 GB for a long production. Formats are prepared on first
        download.
      </p>
      {query.isError && <p role="alert">Could not load exports.</p>}
      {active && (
        <p aria-live="polite">
          Building {job.kind.replaceAll("_", " ")}{" "}
          {Math.round(job.progress * 100)}%{" "}
          {eta !== undefined && (
            <span className="text-muted-foreground">
              · {formatApproximateJobEta(eta)} (estimate)
            </span>
          )}{" "}
          <button type="button" onClick={cancel} className="underline">
            Cancel
          </button>
        </p>
      )}
      {job?.stage === "failed" && (
        <p role="alert" className="text-destructive">
          {job.error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th />
              <th>Artifact</th>
              <th>Duration / size</th>
              <th>Format</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {artifacts.map((artifact) => (
              <ExportRow
                key={artifact.kind}
                projectId={projectId}
                artifact={artifact}
                selected={selected.includes(artifact.kind)}
                toggle={toggle}
                refresh={refresh}
                audioDuration={audioDuration}
              />
            ))}
          </tbody>
        </table>
      </div>
      {downloadable.length > 0 && (
        <p>
          <a href={zip} download className="underline">
            Download selected (ZIP)
          </a>{" "}
          — source size approximately {(size / 1073741824).toFixed(2)} GiB;
          converted size may differ.
        </p>
      )}
    </section>
  );
};

export default ExportsPanel;
