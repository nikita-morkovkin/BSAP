import { Injectable } from '@nestjs/common';
import { split } from 'sentence-splitter';
import type { NormalizedBlock } from './types/normalized-block.type';

@Injectable()
export class ChunkerService {
  public chunk(
    blocks: NormalizedBlock[],
    maxChunkChars = 200,
  ): NormalizedBlock[] {
    if (
      !Number.isInteger(maxChunkChars) ||
      maxChunkChars < 1 ||
      maxChunkChars > 200
    ) {
      throw new Error(
        'maxChunkChars must be an integer between one and two hundred',
      );
    }

    const chunks: NormalizedBlock[] = [];

    for (const block of blocks) {
      const sentences = split(block.text)
        .filter((node) => node.type === 'Sentence')
        .map((node) => node.raw.trim())
        .filter(Boolean);
      const pieces = sentences.flatMap((sentence) =>
        this.splitSentence(sentence, maxChunkChars),
      );

      let pending = '';
      const blockStart = chunks.length;

      for (const piece of pieces) {
        const combined = pending ? `${pending} ${piece}` : piece;

        if (combined.length > maxChunkChars) {
          chunks.push({ text: pending, pauseAfterMs: 600 });
          pending = piece;
        } else {
          pending = combined;
        }
      }

      if (pending) {
        chunks.push({ text: pending, pauseAfterMs: block.pauseAfterMs });
      } else if (chunks.length > blockStart) {
        chunks[chunks.length - 1].pauseAfterMs = block.pauseAfterMs;
      }
    }

    return chunks;
  }

  private splitSentence(sentence: string, limit: number): string[] {
    const pieces: string[] = [];
    let remaining = sentence;

    while (remaining.length > limit) {
      const window = remaining.slice(0, limit + 1);
      const boundaries = [
        ...window.matchAll(/[,;](?=\s)|\s+(?=(?:and|but|where|which)\b)/gi),
      ];

      let boundary = 0;

      for (const match of boundaries) {
        const end = match.index + (/[,;]/.test(match[0]) ? 1 : 0);

        if (end > 0 && end <= limit) {
          boundary = end;
        }
      }

      if (boundary === 0) {
        boundary = window.lastIndexOf(' ');
      }

      if (boundary <= 0) {
        throw new Error(
          'A word exceeds maxChunkChars and cannot be split safely',
        );
      }

      pieces.push(remaining.slice(0, boundary).trim());
      remaining = remaining.slice(boundary).trim();
    }

    if (remaining) {
      pieces.push(remaining);
    }

    return pieces;
  }
}
