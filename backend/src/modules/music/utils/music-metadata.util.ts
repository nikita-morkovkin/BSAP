import type { MusicTrack } from '../types/music-track.type';

export function musicMetadata(track: MusicTrack): Omit<MusicTrack, 'filePath'> {
  return {
    id: track.id,
    displayName: track.displayName,
    originalFilename: track.originalFilename,
    version: track.version,
    durationSeconds: track.durationSeconds,
    sizeBytes: track.sizeBytes,
    sha256: track.sha256,
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
  };
}
