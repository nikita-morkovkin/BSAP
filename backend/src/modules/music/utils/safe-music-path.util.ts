import { promises as fs } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';

export async function safeMusicPath(
  root: string,
  file: string,
): Promise<string> {
  const approved = await fs.realpath(root);
  const candidate = resolve(root, file);
  const lexical = relative(resolve(root), candidate);

  if (
    !lexical ||
    lexical.startsWith(`..${sep}`) ||
    lexical === '..' ||
    isAbsolute(lexical)
  ) {
    throw new Error('Music path is outside its approved root');
  }

  let current = resolve(root);

  for (const segment of lexical.split(sep)) {
    current = resolve(current, segment);

    if ((await fs.lstat(current)).isSymbolicLink()) {
      throw new Error('Symbolic links are not allowed for music storage');
    }
  }

  const actual = await fs.realpath(candidate);
  const difference = relative(approved, actual);

  if (
    difference.startsWith(`..${sep}`) ||
    difference === '..' ||
    isAbsolute(difference)
  ) {
    throw new Error('Music source resolves outside its approved root');
  }

  return actual;
}
