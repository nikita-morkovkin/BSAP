import { VideoPlannerService } from '../video-planner.service';
import { videoStyleSchema } from '../schemas';
import { chunkFilter, chunkSlices, clipTiming, styleHash } from '../utils';

describe('Stock video planning and filter math', () => {
  const planner = new VideoPlannerService();
  const style = videoStyleSchema.parse({
    cycleTargetMinutes: 3,
    fps: 30,
    seed: 42,
  });
  const clips = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    path: `/clips/${index}.mp4`,
    duration: 14 + index / 30,
  }));

  it('is deterministic, frame-quantized, and closes with identical mirror state', () => {
    const plan = planner.plan(clips, style);

    expect(plan).toEqual(planner.plan(clips, style));
    expect(plan.planHash).not.toBe(
      planner.plan(clips, { ...style, seed: 43 }).planHash,
    );
    expect(plan.items.at(-1)?.clipId).toBe(plan.items[0].clipId);
    expect(plan.items.at(-1)?.mirror).toBe(plan.items[0].mirror);
    expect(plan.loopWindow?.startSec).toBe(3);
    expect(plan.loopWindow?.endSec).toBeCloseTo(
      plan.items.at(-1)!.globalStart + 3,
      9,
    );

    for (const item of plan.items) {
      expect(item.globalStart * style.fps).toBeCloseTo(
        Math.round(item.globalStart * style.fps),
        8,
      );
    }

    for (let index = 1; index < plan.items.length; index += 1) {
      expect(plan.items[index].clipId).not.toBe(plan.items[index - 1].clipId);
    }
  });

  it('keeps five clips away across complete bags where mathematically feasible', () => {
    const plan = planner.plan(clips, { ...style, cycleTargetMinutes: 12 });
    const items = plan.items.slice(0, -1);

    for (
      let start = clips.length;
      start + 5 < items.length;
      start += clips.length
    ) {
      const previous = new Set(
        items.slice(start - 5, start).map((item) => item.clipId),
      );

      expect(
        items
          .slice(start, start + 5)
          .every((item) => !previous.has(item.clipId)),
      ).toBe(true);
      expect(items[start].mirror).toBe(
        Math.floor(start / clips.length) % 2 === 1,
      );
    }
  });

  it.each([1, 2, 3, 6])(
    'terminates for small libraries (%i clips)',
    (count) => {
      const plan = planner.plan(clips.slice(0, count), style);

      expect(plan.items.length).toBeGreaterThan(1);
      expect(
        plan.loopWindow!.endSec - plan.loopWindow!.startSec,
      ).toBeGreaterThanOrEqual(180);

      if (count > 1) {
        for (let index = 1; index < plan.items.length; index += 1) {
          expect(plan.items[index].clipId).not.toBe(
            plan.items[index - 1].clipId,
          );
        }
      }
    },
  );

  it('avoids looping when unique footage covers the audio', () => {
    const plan = planner.plan(clips, style, 30);

    expect(plan.loopWindow).toBeUndefined();
    expect(plan.totalSec).toBeGreaterThanOrEqual(30);
  });

  it('partitions the exact global loop interval with K=3 overlapping inputs', () => {
    const plan = planner.plan(clips, style);
    const slices = chunkSlices(plan, style.fps, 3);
    const expected = plan.loopWindow!.endSec - plan.loopWindow!.startSec;

    expect(slices.reduce((sum, slice) => sum + slice.duration, 0)).toBeCloseTo(
      expected,
      8,
    );

    for (let index = 1; index < slices.length; index += 1) {
      const previous = slices[index - 1];
      const current = slices[index];

      expect(previous.end - 1).toBe(current.start);
      expect(
        plan.items[previous.start].globalStart + previous.output,
      ).toBeCloseTo(plan.items[current.start].globalStart + current.input, 8);
    }
  });

  it('builds a bounded graph with local offsets, per-pass mirror and exact trim', () => {
    const plan = planner.plan(clips, style);
    const items = plan.items.slice(0, 2);

    items[1].mirror = true;

    const graph = chunkFilter(items, style, 3, 20);

    expect(graph).toContain(
      '[1:v]settb=AVTB,setpts=PTS-STARTPTS,fps=30,hflip[v1]',
    );
    expect(graph).toContain(
      `xfade=transition=fade:duration=3:offset=${(items[0].duration - 3).toFixed(6)}`,
    );
    expect(graph).toContain('trim=start=3:end=20,setpts=PTS-STARTPTS');
    expect(graph).not.toContain('reverse');
  });

  it('calculates slow motion, capped trims and self-crossfade extensions', () => {
    expect(clipTiming(20, style).slow).toBe(1.25);
    expect(clipTiming(5, style).slow).toBe(2);
    expect(clipTiming(5, style).duration).toBeGreaterThanOrEqual(14);
    expect(clipTiming(60, style).baseDuration).toBe(45);
    expect(clipTiming(60, style).start).toBeGreaterThan(0);
    expect(
      clipTiming(60, { ...style, maxClipDurationSec: 0 }).baseDuration,
    ).toBe(75);
  });

  it('does not invalidate normalization for shuffle and crossfade changes', () => {
    expect(styleHash(style)).toBe(
      styleHash({
        ...style,
        seed: 7,
        crossfadeSec: 2,
        mirrorOnRepeat: false,
        transition: 'dissolve',
      }),
    );
    expect(styleHash(style)).not.toBe(styleHash({ ...style, gamma: 1 }));
  });

  it('rejects unsafe or impossible styles, empty libraries, and short normalized clips', () => {
    expect(() =>
      videoStyleSchema.parse({ vignetteAngle: 'PI/4;movie=secret' }),
    ).toThrow();
    expect(() => videoStyleSchema.parse({ brightness: 2 })).toThrow();
    expect(() =>
      videoStyleSchema.parse({ minClipDurationSec: 8, crossfadeSec: 5 }),
    ).toThrow();
    expect(() => planner.plan([], style)).toThrow('at least one');
    expect(() =>
      planner.plan([{ id: 'short', path: 'short.mp4', duration: 4 }], style),
    ).toThrow('too short');
  });
});
