import type { VideoStyleConfig } from '../types/video-style.type';

export const gradeFilter = (style: VideoStyleConfig): string =>
  [
    `scale=${style.width}:${style.height}:force_original_aspect_ratio=increase`,
    `crop=${style.width}:${style.height}`,
    'setsar=1',
    `eq=brightness=${style.brightness}:contrast=${style.contrast}:saturation=${style.saturation}:gamma=${style.gamma}`,
    ...(style.vignetteEnabled ? [`vignette=angle=${style.vignetteAngle}`] : []),
    'format=yuv420p',
  ].join(',');
