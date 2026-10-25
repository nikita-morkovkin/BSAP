import { outlineSchema } from '../../state/schemas/outline.schema';
import type { Outline } from '../../state/types/outline.type';

export function parseOutline(text: string): Outline {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('Architect response does not contain a JSON outline');
  }

  const json: unknown = JSON.parse(text.slice(start, end + 1));
  const result = outlineSchema.safeParse(json);

  if (!result.success) {
    throw new Error(`Invalid Architect outline: ${result.error.message}`);
  }

  return result.data;
}
