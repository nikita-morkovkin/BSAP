import type { VideoStyleConfig } from '../types/video-style.type';
import { videoHash } from './video-hash.util';

export const styleHash = (style: VideoStyleConfig): string =>
  videoHash({
    version: 2,
    width: style.width,
    height: style.height,
    fps: style.fps,
    brightness: style.brightness,
    contrast: style.contrast,
    saturation: style.saturation,
    gamma: style.gamma,
    vignetteEnabled: style.vignetteEnabled,
    vignetteAngle: style.vignetteAngle,
    slowMoDefault: style.slowMoDefault,
    slowMoMax: style.slowMoMax,
    minClipDurationSec: style.minClipDurationSec,
    maxClipDurationSec: style.maxClipDurationSec,
  });
