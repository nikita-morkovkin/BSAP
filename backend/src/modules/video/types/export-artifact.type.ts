import type { ExportKind } from './export-kind.type';

export interface ExportArtifact {
  kind: ExportKind;
  available: boolean;
  stale: boolean;
  buildable: boolean;
  path?: string;
  sizeBytes?: number;
  durationSec?: number;
  container?: string;
  updatedAt?: string;
  formats: string[];
}
