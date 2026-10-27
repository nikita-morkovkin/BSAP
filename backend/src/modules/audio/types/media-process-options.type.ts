export type MediaProcessOptions = {
  signal?: AbortSignal;
  duration?: number;
  onProgress?: (progress: number) => void;
};
