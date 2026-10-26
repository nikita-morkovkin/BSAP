import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import { writeArtifact } from '../../utils/write-artifact.util';
import { MusicProbeService } from './music-probe.service';
import {
  musicCatalogSchema,
  musicNameSchema,
  musicSelectionSchema,
} from './schemas';
import type { MusicCatalog } from './types/music-catalog.type';
import type { MusicTrack } from './types/music-track.type';
import type { MusicUpload } from './types/music-upload.type';
import type { ProjectMusic } from './types/project-music.type';
import { ambientRoot, musicHash, musicMetadata, safeMusicPath } from './utils';

@Injectable()
export class MusicService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly probe: MusicProbeService,
  ) {}

  private operation: Promise<unknown> = Promise.resolve();
  private catalog?: MusicCatalog;

  public async onModuleInit(): Promise<void> {
    await this.serial(async () => {
      await this.load();

      const root = ambientRoot(this.config);
      const catalog = this.catalog!;

      // Publication is source-first, catalog-last. Unreferenced versions are safe to discard.
      for (const name of await fs.readdir(join(root, 'sources'))) {
        if (
          !catalog.tracks.some((track) => track.filePath === `sources/${name}`)
        ) {
          await fs.rm(join(root, 'sources', name), { force: true });
        }
      }

      await fs.rm(join(root, '.uploads'), { recursive: true, force: true });
      await fs.mkdir(join(root, '.uploads'), { recursive: true });

      for (const name of await fs.readdir(root)) {
        if (/^catalog\.json\.[a-f0-9-]+\.tmp$/.test(name)) {
          await fs.rm(join(root, name), { force: true });
        }
      }
    });
  }

  public async list() {
    return this.serial(async () => {
      const catalog = await this.load();
      const tracks = await Promise.all(
        catalog.tracks.map(async (track) => {
          const { filePath, ...metadata } = track;

          try {
            const path = await safeMusicPath(
              ambientRoot(this.config),
              filePath,
            );

            if ((await musicHash(path)) !== track.sha256) {
              throw new Error('Source checksum mismatch');
            }

            return { ...metadata, available: true, availabilityError: null };
          } catch {
            return {
              ...metadata,
              available: false,
              availabilityError:
                'Source is missing, unsafe, unreadable, or corrupt. Replace the WAV.',
            };
          }
        }),
      );

      return { tracks, importErrors: catalog.importErrors };
    });
  }

  public async upload(
    file: MusicUpload | undefined,
    displayName?: string,
    trackId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Provide one WAV or MP3 in the file field');
    }

    try {
      return await this.serial(async () => {
        const catalog = await this.load();
        const previous = trackId ? this.find(catalog, trackId) : undefined;

        if (
          !['.wav', '.mp3'].includes(extname(file.originalname).toLowerCase())
        ) {
          throw new UnsupportedMediaTypeException(
            'Only WAV and MP3 files are supported',
          );
        }

        const name = musicNameSchema.safeParse({
          displayName:
            displayName ??
            previous?.displayName ??
            basename(file.originalname, extname(file.originalname)),
        });

        if (!name.success) {
          throw new BadRequestException(name.error.issues);
        }

        const track = await this.publish(
          file.path,
          basename(file.originalname),
          name.data.displayName,
          previous,
        );
        const next = {
          ...catalog,
          tracks: previous
            ? catalog.tracks.map((item) =>
                item.id === previous.id ? track : item,
              )
            : [...catalog.tracks, track],
        };

        await this.commit(next);

        if (previous) {
          await fs.rm(join(ambientRoot(this.config), previous.filePath), {
            force: true,
          });
        }

        return { ...musicMetadata(track), available: true };
      });
    } finally {
      await fs.rm(file.path, { force: true });
    }
  }

  public async rename(id: string, displayName: string) {
    return this.serial(async () => {
      const validated = musicNameSchema.safeParse({ displayName });

      if (!validated.success) {
        throw new BadRequestException(validated.error.issues);
      }

      const catalog = await this.load();
      const track = this.find(catalog, id);
      const updated = {
        ...track,
        displayName: validated.data.displayName,
        updatedAt: new Date().toISOString(),
      };

      await this.commit({
        ...catalog,
        tracks: catalog.tracks.map((item) => (item.id === id ? updated : item)),
      });

      return musicMetadata(updated);
    });
  }

  public async delete(id: string): Promise<void> {
    await this.serial(async () => {
      const catalog = await this.load();
      const track = this.find(catalog, id);

      await this.commit({
        ...catalog,
        tracks: catalog.tracks.filter((item) => item.id !== id),
      });
      await fs.rm(join(ambientRoot(this.config), track.filePath), {
        force: true,
      });
    });
  }

  public async snapshot(
    projectRoot: string,
    ids: string[] | undefined,
    revision: number,
    saved?: ProjectMusic,
  ): Promise<ProjectMusic> {
    return this.serial(async () => {
      const catalog = await this.load();
      const selectedTrackIds = ids ?? (await this.validIds(catalog));
      const parsed = musicSelectionSchema.safeParse(selectedTrackIds);

      if (!parsed.success) {
        throw new BadRequestException(parsed.error.issues);
      }

      const batch = randomUUID();
      const directory = join(projectRoot, 'music', batch);
      const snapshots: ProjectMusic['snapshots'] = [];

      await fs.mkdir(directory, { recursive: true });
      await safeMusicPath(projectRoot, `music/${batch}`);

      try {
        for (const id of selectedTrackIds) {
          // Keeping a checkbox selected preserves the exact saved version, even if deleted globally.
          const existing = saved?.snapshots.find((track) => track.id === id);
          const track = existing ?? this.find(catalog, id);
          const source = await safeMusicPath(
            existing ? projectRoot : ambientRoot(this.config),
            track.filePath,
          );

          if ((await musicHash(source)) !== track.sha256) {
            throw new BadRequestException(
              `Selected track ${track.displayName} is corrupt. Explicitly remove or replace it.`,
            );
          }

          const filePath = `music/${batch}/${randomUUID()}${extname(track.filePath)}`;

          await fs.copyFile(source, join(projectRoot, filePath));

          snapshots.push({ ...track, filePath });
        }

        return { revision, selectedTrackIds, snapshots };
      } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });

        throw error;
      }
    });
  }

  private async load(): Promise<MusicCatalog> {
    if (this.catalog) {
      return this.catalog;
    }

    const root = ambientRoot(this.config);

    await fs.mkdir(join(root, 'sources'), { recursive: true });
    await safeMusicPath(root, 'sources');

    try {
      const path = await safeMusicPath(root, 'catalog.json');

      this.catalog = musicCatalogSchema.parse(
        JSON.parse(await fs.readFile(path, 'utf8')),
      );

      return this.catalog;
    } catch (error: unknown) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }

    const catalog: MusicCatalog = {
      formatVersion: 1,
      tracks: [],
      importErrors: [],
    };
    const entries = (await fs.readdir(root, { withFileTypes: true }))
      .filter(
        (entry) =>
          ['.wav', '.mp3'].includes(extname(entry.name).toLowerCase()) &&
          !entry.name.startsWith('.'),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      try {
        const source = await safeMusicPath(root, entry.name);

        catalog.tracks.push(
          await this.publish(
            source,
            entry.name,
            basename(entry.name, extname(entry.name)),
          ),
        );
      } catch {
        catalog.importErrors.push({
          filename: entry.name,
          message:
            'Unable to import: invalid, unreadable, or unsafe WAV/MP3. Upload a valid replacement.',
        });
      }
    }

    await this.commit(catalog);

    return catalog;
  }

  private async publish(
    source: string,
    filename: string,
    displayName: string,
    previous?: MusicTrack,
  ): Promise<MusicTrack> {
    const format = extname(filename).toLowerCase() === '.mp3' ? 'mp3' : 'wav';
    const audio = await this.probe.validate(source, format);
    const version = randomUUID();
    const filePath = `sources/${version}.${format}`;
    const destination = join(ambientRoot(this.config), filePath);
    const now = new Date().toISOString();

    await safeMusicPath(ambientRoot(this.config), 'sources');

    try {
      await fs.copyFile(source, `${destination}.tmp`);
      await fs.rename(`${destination}.tmp`, destination);
    } finally {
      await fs.rm(`${destination}.tmp`, { force: true });
    }

    return {
      id: previous?.id ?? randomUUID(),
      version,
      filePath,
      displayName,
      originalFilename: filename,
      ...audio,
      sha256: await musicHash(destination),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private async commit(catalog: MusicCatalog): Promise<void> {
    const validated = musicCatalogSchema.parse(catalog);

    await writeArtifact(
      join(ambientRoot(this.config), 'catalog.json'),
      JSON.stringify(validated, null, 2),
    );

    this.catalog = validated;
  }

  private async validIds(catalog: MusicCatalog): Promise<string[]> {
    const ids: string[] = [];

    for (const track of catalog.tracks) {
      try {
        const path = await safeMusicPath(
          ambientRoot(this.config),
          track.filePath,
        );

        if ((await musicHash(path)) === track.sha256) {
          ids.push(track.id);
        }
      } catch {
        // Invalid sources remain visible in the library but are not migration defaults.
      }
    }

    return ids;
  }

  private find(catalog: MusicCatalog, id: string): MusicTrack {
    const track = catalog.tracks.find((item) => item.id === id);

    if (!track) {
      throw new NotFoundException(
        `Music track ${id} does not exist; refresh the library`,
      );
    }

    return track;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation);

    this.operation = next.catch(() => undefined);

    return next;
  }
}
