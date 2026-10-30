import { effectiveEffects } from '../utils/effective-effects.util';
import { effectFilter } from '../utils/effect-filter.util';
import { effectSchema } from '../schemas/effect.schema';
import { videoStyleSchema } from '../schemas';
import { videoHash } from '../utils';
import { presetField } from '../utils/preset-field.util';

describe('Iteration 2 deterministic media parameters', () => {
  const style = videoStyleSchema.parse({});
  const effect = effectSchema.parse({
    id: '0123456789abcdef',
    name: 'Snow',
    path: 'video/effects/snow.mp4',
    thumbPath: 'video/effects/snow.jpg',
    durationSec: 5,
    hasAlpha: false,
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

  it('rejects unsafe effect parameters', () => {
    expect(effectSchema.safeParse({ ...effect, speed: 9 }).success).toBe(false);
  });
});
