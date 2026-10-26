import { ConfigService } from '@nestjs/config';
import { basename, resolve } from 'path';

export function ambientRoot(config: ConfigService): string {
  const root =
    basename(process.cwd()) === 'backend'
      ? resolve(process.cwd(), '..')
      : process.cwd();

  return resolve(
    config.get<string>('AMBIENT_DIR') ?? resolve(root, 'assets', 'ambient'),
  );
}
