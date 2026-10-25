import { ChunkerService } from '../chunker.service';
import { TextNormalizerService } from '../text-normalizer.service';

describe('Deterministic text normalization and syntactic chunking', () => {
  const normalizer = new TextNormalizerService();
  const chunker = new ChunkerService();

  it('normalizes the task example and preserves its explicit pause', () => {
    const raw =
      'In the 1980s, **temperatures** reached -45.2°C (approx. 15%)! [PAUSE:3.5] Deep silence followed.';
    const chunks = chunker.chunk(normalizer.normalize(raw));

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      text: 'In the nineteen eighties, temperatures reached minus forty-five point two degrees Celsius (approx. fifteen percent)!',
      pauseAfterMs: 3500,
    });
    expect(chunks[1]).toEqual({
      text: 'Deep silence followed.',
      pauseAfterMs: 600,
    });

    for (const chunk of chunks) {
      expect(chunk.text).not.toMatch(/\d/);
      expect(chunk.text).not.toMatch(/[*_#`[\]%°]/);
      expect(chunk.text.length).toBeLessThanOrEqual(200);
    }
  });

  it.each([
    ['1970s and 2020s', 'nineteen seventies and twenty twenties'],
    ['1984 and 2026', 'nineteen eighty-four and twenty twenty-six'],
    [
      '1900, 1905, 2000, 2006',
      'nineteen hundred, nineteen oh five, two thousand, two thousand six',
    ],
    [
      '-45.20, 15%, 5km, 32°F',
      'minus forty-five point two zero, fifteen percent, five kilometers, thirty-two degrees Fahrenheit',
    ],
    [
      '1,234 and 42 and 0',
      'one thousand two hundred thirty-four and forty-two and zero',
    ],
    [
      '9007199254740992',
      'nine zero zero seven one nine nine two five four seven four zero nine nine two',
    ],
    ['# **Quiet** _stars_ `shine` [whisper softly].', 'Quiet stars shine.'],
    ['[PAUSE:no] [PAUSE:-2] [BREATHING] Calm.', 'Calm.'],
    ['```markdown\n**Quiet**\n```', 'Quiet'],
  ])('normalizes %s deterministically', (raw, expected) => {
    expect(normalizer.normalize(raw)).toEqual([
      { text: expected, pauseAfterMs: 600 },
    ]);
    expect(normalizer.normalize(raw)).toEqual(normalizer.normalize(raw));
  });

  it('treats breath and consecutive pause tags as structural breaks', () => {
    expect(
      normalizer.normalize(
        'Soft.[BREATH] Still.[PAUSE:2.0005][PAUSE:1] Quiet.',
      ),
    ).toEqual([
      { text: 'Soft.', pauseAfterMs: 600 },
      { text: 'Still.', pauseAfterMs: 3001 },
      { text: 'Quiet.', pauseAfterMs: 600 },
    ]);
    expect(normalizer.normalize('[PAUSE:3] [stage direction]')).toEqual([]);
  });

  it('greedily merges sentences without merging across explicit breaks', () => {
    expect(
      chunker.chunk(
        normalizer.normalize('One. Two. Three.[PAUSE:4] Four.'),
        10,
      ),
    ).toEqual([
      { text: 'One. Two.', pauseAfterMs: 600 },
      { text: 'Three.', pauseAfterMs: 4000 },
      { text: 'Four.', pauseAfterMs: 600 },
    ]);
    expect(chunker.chunk(normalizer.normalize('One. Two.'), 9)).toHaveLength(1);
  });

  it.each([',', ';', ' and', ' but', ' where', ' which', ''])(
    'splits long sentences safely using %s or whitespace',
    (separator) => {
      const text = `The soft stars shine${separator} the quiet waters reflect the gentle light of distant galaxies and the night grows still.`;
      const chunks = chunker.chunk([{ text, pauseAfterMs: 3500 }], 45);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.map((chunk) => chunk.text).join(' ')).toBe(text);
      expect(chunks.at(-1)?.pauseAfterMs).toBe(3500);
      expect(
        chunks.slice(0, -1).every((chunk) => chunk.pauseAfterMs === 600),
      ).toBe(true);
      expect(
        chunks.every(
          (chunk) => chunk.text.length > 0 && chunk.text.length <= 45,
        ),
      ).toBe(true);
    },
  );

  it('rejects invalid limits, unsafe pauses, and words that cannot fit safely', () => {
    for (const limit of [0, -1, 201, 1.5, NaN]) {
      expect(() => chunker.chunk([], limit)).toThrow('maxChunkChars');
    }

    expect(() =>
      chunker.chunk([{ text: 'unbreakable', pauseAfterMs: 600 }], 4),
    ).toThrow('cannot be split safely');
    expect(() =>
      normalizer.normalize('Quiet.[PAUSE:999999999999999999]'),
    ).toThrow('safe millisecond range');
    expect(chunker.chunk(normalizer.normalize(' [stage] ** ** '))).toEqual([]);
  });
});
