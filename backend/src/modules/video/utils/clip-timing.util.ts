import type { VideoStyleConfig } from '../types/video-style.type';
import { quantize } from './quantize.util';

export const clipTiming = (duration: number, style: VideoStyleConfig) => {
  const slow = Math.min(
    style.slowMoMax,
    Math.max(style.slowMoDefault, style.minClipDurationSec / duration),
  );
  const stretched = quantize(duration * slow, style.fps);
  const cap = style.maxClipDurationSec || stretched;
  let result = Math.min(stretched, cap);
  const extensions: { duration: number; fade: number }[] = [];

  for (
    let index = 0;
    index < 2 && result < style.minClipDurationSec;
    index += 1
  ) {
    const fade = quantize(Math.min(1.5, result / 3), style.fps);

    extensions.push({ duration: result, fade });

    result = quantize(2 * result - fade, style.fps);
  }

  return {
    slow,
    baseDuration: Math.min(stretched, cap),
    start: Math.min(3, Math.max(0, (stretched - cap) / 2)) / slow,
    extensions,
    duration: result,
  };
};
