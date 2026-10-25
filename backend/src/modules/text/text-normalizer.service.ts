import { Injectable } from '@nestjs/common';
import { toWords } from 'number-to-words';
import type { NormalizedBlock } from './types/normalized-block.type';

@Injectable()
export class TextNormalizerService {
  public normalize(raw: string): NormalizedBlock[] {
    const blocks: NormalizedBlock[] = [];
    const tags = /\[PAUSE:(\d+(?:\.\d+)?)\]|\[BREATH\]|\[[^\]]*\]/gi;
    let cursor = 0;
    let pending = '';

    for (const match of raw.matchAll(tags)) {
      pending += raw.slice(cursor, match.index);
      cursor = match.index + match[0].length;

      if (match[1] === undefined && match[0].toUpperCase() !== '[BREATH]') {
        pending += ' ';

        continue;
      }

      const pauseAfterMs =
        match[1] === undefined ? 600 : Math.round(parseFloat(match[1]) * 1000);

      if (!Number.isSafeInteger(pauseAfterMs)) {
        throw new Error('Pause duration exceeds the safe millisecond range');
      }

      const text = this.normalizeText(pending);

      if (text) {
        blocks.push({ text, pauseAfterMs });
      } else if (blocks.length > 0) {
        const previous = blocks[blocks.length - 1];
        const combinedPause = previous.pauseAfterMs + pauseAfterMs;

        if (!Number.isSafeInteger(combinedPause)) {
          throw new Error('Combined pause exceeds the safe millisecond range');
        }

        previous.pauseAfterMs = combinedPause;
      }

      pending = '';
    }

    const text = this.normalizeText(pending + raw.slice(cursor));

    if (text) {
      blocks.push({ text, pauseAfterMs: 600 });
    }

    return blocks;
  }

  private normalizeText(raw: string): string {
    const text = raw
      .replace(/```[^\S\r\n]*[a-z]*[^\S\r\n]*\r?\n/gi, '')
      .replace(/[*_#`]/g, '')
      .replace(/°\s*C\b/gi, ' degrees Celsius ')
      .replace(/°\s*F\b/gi, ' degrees Fahrenheit ')
      .replace(/°/g, ' degrees ')
      .replace(/%/g, ' percent ')
      .replace(/\bkm\b/gi, ' kilometers ')
      .replace(/(?<=\d)km\b/gi, ' kilometers ')
      .replace(/[−–](?=\d)/g, '-')
      .replace(/\b(1\d{2}0|20\d0)s\b/g, (_match, digits: string) =>
        this.decadeToWords(Number(digits)),
      )
      .replace(
        /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g,
        (value) => ` ${this.numberToWords(value)} `,
      )
      .replace(/&/g, ' and ')
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ')
      .replace(/[[\]]/g, ' ');

    return text
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?%)])/g, '$1')
      .replace(/\(\s+/g, '(')
      .trim();
  }

  private numberToWords(value: string): string {
    const unsigned = value.replace(/^[+-]/, '').replace(/,/g, '');
    const [integer, fraction] = unsigned.split('.');
    const number = Number(integer);
    const prefix = value.startsWith('-')
      ? 'minus '
      : value.startsWith('+')
        ? 'plus '
        : '';
    const words =
      fraction === undefined &&
      /^\d{4}$/.test(value) &&
      number >= 1000 &&
      number < 2100
        ? this.yearToWords(number)
        : this.integerToWords(integer);

    if (fraction !== undefined) {
      return `${prefix}${words} point ${this.digitsToWords(fraction)}`;
    }

    return `${prefix}${words}`;
  }

  private integerToWords(value: string): string {
    const number = Number(value);

    if (!Number.isSafeInteger(number)) {
      return this.digitsToWords(value);
    }

    return toWords(number).replace(/,/g, '');
  }

  private digitsToWords(value: string): string {
    return [...value].map((digit) => toWords(Number(digit))).join(' ');
  }

  private yearToWords(year: number): string {
    const century = Math.floor(year / 100);
    const remainder = year % 100;

    if (year >= 2000 && year < 2010) {
      return remainder === 0
        ? 'two thousand'
        : `two thousand ${toWords(remainder)}`;
    }

    if (remainder === 0) {
      return `${toWords(century)} hundred`;
    }

    return `${toWords(century)} ${remainder < 10 ? 'oh ' : ''}${toWords(remainder)}`;
  }

  private decadeToWords(year: number): string {
    const decade = year % 100;

    if (decade === 0) {
      return year === 2000
        ? 'two thousands'
        : `${toWords(Math.floor(year / 100))} hundreds`;
    }

    const words = toWords(decade);
    const plural = words.endsWith('y')
      ? `${words.slice(0, -1)}ies`
      : `${words}s`;

    return `${toWords(Math.floor(year / 100))} ${plural}`;
  }
}
