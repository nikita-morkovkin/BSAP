export type VideoStyleConfig = {
  width: number; height: number; fps: number;
  minClipDurationSec: number; maxClipDurationSec: number;
  slowMoDefault: number; slowMoMax: number; crossfadeSec: number;
  transition: 'fade' | 'smoothleft' | 'dissolve';
  brightness: number; contrast: number; saturation: number; gamma: number;
  vignetteEnabled: boolean; vignetteAngle: 'PI/3' | 'PI/4' | 'PI/5' | 'PI/6';
  mirrorOnRepeat: boolean; cycleTargetMinutes: number; seed: number;
};

export type StockClip = {
  id: string; originalName: string; durationSec: number; fps: number;
  width: number; height: number; sizeBytes: number; enabled: boolean;
  status: 'uploaded' | 'ready' | 'invalid'; invalidReason?: string;
  vfr: boolean; plannedDurationSec?: number;
};

export type VideoJob = {
  jobId: string; projectId: string;
  kind: 'build' | 'preview' | 'mux';
  stage: 'queued' | 'normalizing' | 'planning' | 'rendering_chunks' | 'stitching' | 'muxing' | 'done' | 'failed' | 'cancelled';
  progress: number; stageProgress: number; message?: string; error?: string;
  outputPath?: string; startedAt: string; updatedAt: string;
};

export type VideoStatus = {
  audio: { duration: number } | null;
  job?: VideoJob;
  cycle?: { path: string; duration: number; loop: boolean; fps: number };
  output?: string; preview?: string;
};

export type VideoUploadItem = {
  id: string; file: File; progress: number;
  status: 'queued' | 'uploading' | 'done' | 'failed'; error?: string;
};