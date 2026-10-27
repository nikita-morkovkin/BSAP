export type ExportArtifact = {
  kind: string; available: boolean; stale: boolean; buildable: boolean;
  sizeBytes?: number; durationSec?: number; formats: string[];
};