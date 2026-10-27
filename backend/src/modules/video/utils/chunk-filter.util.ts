import type { PlanItem } from '../types/plan-item.type';
import type { VideoStyleConfig } from '../types/video-style.type';
import { quantize } from './quantize.util';

export const chunkFilter = (
  items: PlanItem[],
  style: VideoStyleConfig,
  input: number,
  output: number,
  fadeEnd = false,
): string => {
  const filters = items.map(
    (item, index) =>
      `[${index}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${style.fps}${item.mirror ? ',hflip' : ''}[v${index}]`,
  );
  let previous = 'v0';
  let offset = 0;

  for (let index = 1; index < items.length; index += 1) {
    offset = quantize(
      offset + items[index - 1].duration - style.crossfadeSec,
      style.fps,
    );

    filters.push(
      `[${previous}][v${index}]xfade=transition=${style.transition}:duration=${style.crossfadeSec}:offset=${offset.toFixed(6)}[x${index}]`,
    );

    previous = `x${index}`;
  }

  const fade = fadeEnd
    ? `,fade=t=out:st=${Math.max(0, output - input - 4)}:d=4`
    : '';

  filters.push(
    `[${previous}]trim=start=${input}:end=${output},setpts=PTS-STARTPTS${fade},format=yuv420p[out]`,
  );

  return filters.join(';');
};
