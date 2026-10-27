export type MusicTrack = {
  id: string;
  displayName: string;
  originalFilename: string;
  version: string;
  durationSeconds: number;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
  available: boolean;
  availabilityError?: string | null;
};

export type ProjectMusic = {
  revision: number;
  selectedTrackIds: string[];
  snapshots: (Omit<MusicTrack, 'available'> & { filePath: string })[];
};

export type MusicCatalog = {
  tracks: MusicTrack[];
  importErrors: { filename: string; message: string }[];
};

export type MusicAction =
  | { kind: 'upload'; file: File; displayName: string }
  | { kind: 'replace'; id: string; file: File }
  | { kind: 'rename'; id: string; displayName: string }
  | { kind: 'delete'; id: string };

export type ProjectMusicAction =
  | { kind: 'save'; revision: number; selectedTrackIds: string[]; ambientVolumeDb?: number }
  | { kind: 'remaster' };