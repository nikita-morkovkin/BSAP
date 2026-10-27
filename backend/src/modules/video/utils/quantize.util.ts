export const quantize = (seconds: number, fps: number): number =>
  Math.round(seconds * fps) / fps;
