import { Injectable } from '@nestjs/common';
import type { NormalizedClip } from './types/normalized-clip.type';
import type { PlanItem } from './types/plan-item.type';
import type { VideoPlan } from './types/video-plan.type';
import type { VideoStyleConfig } from './types/video-style.type';
import { quantize, videoHash } from './utils';

@Injectable()
export class VideoPlannerService {
  public plan(
    clips: NormalizedClip[],
    style: VideoStyleConfig,
    audioDuration?: number,
  ): VideoPlan {
    if (!clips.length) {
      throw new Error('Enable at least one valid stock clip');
    }

    const fps = style.fps;
    const x = Math.round(style.crossfadeSec * fps);
    const frames = (clip: NormalizedClip) => Math.round(clip.duration * fps);

    if (clips.some((clip) => frames(clip) <= 2 * x)) {
      throw new Error(
        'A normalized clip is too short for two crossfades; reduce crossfade duration',
      );
    }

    const unique = clips.reduce((sum, clip) => sum + frames(clip) - x, x);
    const loop = !audioDuration || unique < Math.ceil(audioDuration * fps);
    const target =
      Math.ceil(
        (!loop && audioDuration
          ? audioDuration
          : Math.min(
              audioDuration ?? Infinity,
              style.cycleTargetMinutes * 60,
            )) * fps,
      ) + (loop ? x : 0);
    const items: PlanItem[] = [];
    let state = style.seed >>> 0;
    let total = 0;
    let pass = 0;
    const random = () => {
      state += 0x6d2b79f5;

      let value = state;

      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };

    while (total < target) {
      const bag = [...clips];

      for (let index = bag.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));

        [bag[index], bag[other]] = [bag[other], bag[index]];
      }

      // The full five-clip exclusion is impossible for libraries of <= 10 clips.
      // Use the largest feasible symmetric window, keeping adjacency safe for n > 1.
      const window = Math.min(5, Math.floor(clips.length / 2));
      const excluded = new Set(items.slice(-window).map((item) => item.clipId));
      const head = bag
        .filter((clip) => !excluded.has(clip.id))
        .slice(0, window);
      const ordered = [...head, ...bag.filter((clip) => !head.includes(clip))];

      for (const clip of ordered) {
        const start = items.length ? total - x : 0;

        items.push({
          clipId: clip.id,
          path: clip.path,
          duration: frames(clip) / fps,
          mirror: style.mirrorOnRepeat && pass % 2 === 1,
          globalStart: start / fps,
        });

        total = start + frames(clip);

        if (total >= target) {
          break;
        }
      }

      pass += 1;
    }

    let loopWindow: VideoPlan['loopWindow'];

    if (loop) {
      const first = items[0];

      if (clips.length > 1 && items[items.length - 1].clipId === first.clipId) {
        const alternate = clips.find((clip) => clip.id !== first.clipId)!;
        const start = total - x;

        items.push({
          clipId: alternate.id,
          path: alternate.path,
          duration: frames(alternate) / fps,
          mirror: items[items.length - 1].mirror,
          globalStart: start / fps,
        });

        total = start + frames(alternate);
      }

      const closingStart = total - x;

      items.push({ ...first, globalStart: closingStart / fps });

      loopWindow = { startSec: x / fps, endSec: (closingStart + x) / fps };
      total = closingStart + Math.round(first.duration * fps);
    }

    const plan = {
      items,
      crossfade: x / fps,
      loopWindow,
      totalSec: quantize(
        !loop && audioDuration ? audioDuration : total / fps,
        fps,
      ),
    };

    return { ...plan, planHash: videoHash({ version: 1, plan, style }) };
  }
}
