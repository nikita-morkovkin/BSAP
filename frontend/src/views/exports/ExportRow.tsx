import { apiClient } from "@/api/apiClient";
import Button from "@/components/ui/Button";
import type { ExportArtifact } from "@/types/export-artifact.type";
import { useExportRow } from "./hooks/useExportRow.hook";

type ExportRowProps = {
  projectId: string;
  artifact: ExportArtifact;
  selected: boolean;
  toggle: (kind: string) => void;
  refresh: () => void;
  audioDuration?: number;
};

const ExportRow = ({
  projectId,
  artifact,
  selected,
  toggle,
  refresh,
  audioDuration,
}: ExportRowProps) => {
  const {
    format,
    duration,
    error,
    building,
    includeGreeting,
    greeting,
    changeFormat,
    changeDuration,
    build,
  } = useExportRow({
    projectId,
    kind: artifact.kind,
    formats: artifact.formats,
    audioDuration,
    refresh,
  });

  const select = () => {
    toggle(artifact.kind);
  };

  const url = apiClient.exports.download(projectId, artifact.kind, format);
  const status = building
    ? "Starting…"
    : artifact.stale
      ? "Outdated"
      : artifact.available
        ? "Ready"
        : "Not built";
  const size = artifact.sizeBytes
    ? `${(artifact.sizeBytes / 1073741824).toFixed(2)} GiB`
    : "—";
  const label = artifact.kind.replaceAll("_", " ");
  const buildLabel = artifact.available ? "Rebuild" : "Build";
  const disabled = !artifact.available || artifact.stale;

  return (
    <tr className="border-b align-top">
      <td className="p-2">
        <input
          type="checkbox"
          aria-label={label}
          checked={selected}
          disabled={disabled}
          onChange={select}
        />
      </td>
      <td className="p-2 capitalize">
        {label}
        {artifact.kind === "video_full" && (
          <label className="block text-xs">
            Duration (hh:mm:ss; defaults to audio)
            <input
              value={duration}
              onChange={changeDuration}
              placeholder="04:30:00"
              className="block rounded border p-1"
            />
          </label>
        )}
        {artifact.kind === "video_full" && (
          <label className="block text-xs">
            <input
              type="checkbox"
              checked={includeGreeting}
              onChange={greeting}
            />{" "}
            Include configured mascot greeting
          </label>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </td>
      <td className="p-2">
        {artifact.durationSec?.toFixed(1)} s<br />
        {size}
      </td>
      <td className="p-2">
        <select value={format} onChange={changeFormat} aria-label="Format">
          {artifact.formats.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </td>
      <td className="p-2">{status}</td>
      <td className="space-x-2 p-2">
        {!disabled && (
          <a href={url} download className="underline">
            Download
          </a>
        )}
        {artifact.buildable && (
          <Button
            size="sm"
            variant="outline"
            onClick={build}
            disabled={building}
          >
            {buildLabel}
          </Button>
        )}
      </td>
    </tr>
  );
};

export default ExportRow;
