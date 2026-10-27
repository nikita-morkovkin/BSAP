import type { VideoPlan } from '../types/video-plan.type';
import { quantize } from './quantize.util';

export const chunkSlices = (plan: VideoPlan, fps: number, size: number) => {
  const slices: {
    start: number;
    end: number;
    input: number;
    output: number;
    duration: number;
  }[] = [];
  const k = Math.min(12, Math.max(2, size));
  const windowStart = plan.loopWindow?.startSec ?? 0;
  const windowEnd = plan.loopWindow?.endSec ?? plan.totalSec;

  for (let start = 0; start < plan.items.length; start += k - 1) {
    const end = Math.min(plan.items.length, start + k);
    const first = plan.items[start];
    const last = plan.items[end - 1];
    const localEnd = last.globalStart - first.globalStart + last.duration;
    const input = start === 0 ? windowStart : first.duration - plan.crossfade;
    const output =
      end === plan.items.length
        ? windowEnd - first.globalStart
        : localEnd - plan.crossfade;

    slices.push({
      start,
      end,
      input: quantize(input, fps),
      output: quantize(output, fps),
      duration: quantize(output - input, fps),
    });

    if (end === plan.items.length) {
      break;
    }
  }

  return slices;
};
