import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';

export async function writeArtifact(
  path: string,
  contents: string,
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(temporary, contents, 'utf8');
    await fs.rename(temporary, path);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
