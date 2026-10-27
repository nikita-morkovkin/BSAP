import { analyzeVad } from '../utils/analyze-vad.util';
import { effectiveEffects } from '../utils/effective-effects.util';
import { effectFilter } from '../utils/effect-filter.util';
import { greetingCompositeFilter } from '../utils/greeting-composite-filter.util';
import { greetingSchema } from '../schemas/greeting.schema';
import { effectSchema } from '../schemas/effect.schema';
import { videoStyleSchema } from '../schemas';
import { videoHash } from '../utils';
import { presetField } from '../utils/preset-field.util';

describe('Iteration 2 deterministic media parameters', () => {
  const style = videoStyleSchema.parse({});
  const config = greetingSchema.parse({});
  const effect = effectSchema.parse({
    id: '0123456789abcdef',
    name: 'Snow',
    path: 'video/effects/snow.mp4',
    thumbPath: 'video/effects/snow.jpg',
    durationSec: 5,
    hasAlpha: false,
  });

  it('detects speech, suppresses short bursts and merges short silent gaps deterministically', () => {
    const samples = new Int16Array(16000 * 2);

    samples.fill(12000, 1600, 2000);
    samples.fill(12000, 4800, 11200);
    samples.fill(12000, 12000, 20800);

    const result = analyzeVad(samples, 16000, config.vad, 30);

    expect(result).toEqual(analyzeVad(samples, 16000, config.vad, 30));
    expect(result.segments.filter((segment) => segment.speaking)).toHaveLength(
      1,
    );
    expect(
      result.segments.find((segment) => segment.speaking)?.start,
    ).toBeGreaterThan(0.2);
    expect(
      result.segments.every(
        (segment) =>
          Math.abs(segment.start * 30 - Math.round(segment.start * 30)) < 0.001,
      ),
    ).toBe(true);
  });

  it('keeps silence at the edges and handles empty audio', () => {
    expect(
      analyzeVad(new Int16Array(16000), 16000, config.vad, 30).segments,
    ).toEqual([{ start: 0, end: 1, speaking: false }]);
    expect(analyzeVad(new Int16Array(), 16000, config.vad, 30)).toEqual({
      segments: [],
      peaks: [],
    });
  });

  it('generates deterministic seeded preset fields with distinct shapes', () => {
    for (const kind of [
      'marine_snow',
      'bubbles_rising',
      'light_rays',
      'dust_motes',
      'plankton_sparkle',
    ]) {
      const image = presetField(kind, 17, 160, 90);

      expect(image).toEqual(presetField(kind, 17, 160, 90));
      expect(image).not.toEqual(presetField(kind, 18, 160, 90));
      expect(image.subarray(0, 2).toString()).toBe('P5');
    }
  });

  it('uses seeded rules and explicit empty assignments override rules', () => {
    const rules = { defaultEffectId: effect.id, applyToPercent: 100, seed: 7 };

    expect(effectiveEffects('clip', [effect], {}, rules)).toEqual([effect]);
    expect(effectiveEffects('clip', [effect], { clip: [] }, rules)).toEqual([]);
    expect(
      effectiveEffects('clip', [effect], {}, { ...rules, applyToPercent: 0 }),
    ).toEqual([]);
  });

  it('invalidates only clips using an edited effect', () => {
    const assignments = { a: [effect.id], b: [] };
    const before = ['a', 'b'].map((id) =>
      videoHash(effectiveEffects(id, [effect], assignments)),
    );
    const after = ['a', 'b'].map((id) =>
      videoHash(
        effectiveEffects(id, [{ ...effect, opacity: 0.1 }], assignments),
      ),
    );

    expect(before[0]).not.toBe(after[0]);
    expect(before[1]).toBe(after[1]);
  });

  it('chains blends in order before vignette and applies opacity to alpha', () => {
    const graph = effectFilter(
      [effect, { ...effect, blend: 'overlay_alpha' }],
      style,
      'base',
    ).join(';');

    expect(graph).toContain('all_mode=screen:all_opacity=0.5');
    expect(graph).toContain('colorchannelmixer=aa=0.5');
    expect(graph).toContain('[blend0][fx1]overlay');
    expect(graph.indexOf('vignette')).toBeGreaterThan(graph.indexOf('overlay'));
    expect(effectFilter([], style, 'base').join(';')).not.toContain('[fx');
  });

  it('composites circular alpha masks and fullscreen dissolves without raw filter input', () => {
    expect(greetingCompositeFilter(config, style, 12)).toContain('hypot');
    expect(
      greetingCompositeFilter(
        { ...config, placement: 'intro_fullscreen' },
        style,
        12,
      ),
    ).toContain('fade=t=out:st=11:d=1:alpha=1');
    expect(
      greetingSchema.safeParse({ pip: { position: '0;movie=secret' } }).success,
    ).toBe(false);
    expect(effectSchema.safeParse({ ...effect, speed: 9 }).success).toBe(false);
  });
});
