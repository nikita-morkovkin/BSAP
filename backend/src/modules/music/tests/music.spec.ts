import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MusicProbeService } from '../music-probe.service';
import { MusicService } from '../music.service';
import { musicCatalogSchema } from '../schemas';
import { safeMusicPath } from '../utils';

describe('Persistent music catalog and immutable snapshots', () => {
  let root: string;
  let config: ConfigService;
  let probe: MusicProbeService;
  let library: MusicService;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'bsap-music-'));
    config = new ConfigService({ AMBIENT_DIR: join(root, 'ambient') });
    probe = new MusicProbeService(config);

    jest.spyOn(probe, 'validate').mockImplementation(async (path) => ({
      durationSeconds: 2,
      sizeBytes: (await fs.stat(path)).size,
    }));

    library = new MusicService(config, probe);

    await library.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const upload = async (name: string, content = 'audio', id?: string) => {
    const path = join(root, `${name}-${Math.random()}.tmp`);

    await fs.writeFile(path, content);

    return library.upload(
      { path, originalname: `${name}.wav`, size: content.length },
      name,
      id,
    );
  };

  it('serializes concurrent CRUD, permits duplicate names, and persists stable IDs on restart', async () => {
    const tracks = await Promise.all([upload('same'), upload('same')]);

    expect(tracks[0].id).not.toBe(tracks[1].id);

    await library.rename(tracks[0].id, 'Renamed');

    const beforeRestart = (await library.list()).tracks;

    const restarted = new MusicService(config, probe);

    await restarted.onModuleInit();

    expect((await restarted.list()).tracks.map((track) => track.id)).toEqual(
      beforeRestart.map((track) => track.id),
    );
    expect(
      (await restarted.list()).tracks.find((track) => track.id === tracks[0].id)
        ?.displayName,
    ).toBe('Renamed');
    expect(JSON.stringify(await restarted.list())).not.toContain('filePath');

    await restarted.delete(tracks[0].id);

    expect((await restarted.list()).tracks).toHaveLength(1);
    await expect(restarted.delete(tracks[0].id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('keeps ordered project copies reproducible after replacement, deletion, and restart', async () => {
    const first = await upload('first', 'original first');
    const second = await upload('second', 'original second');
    const project = join(root, 'project');

    await fs.mkdir(project);

    const saved = await library.snapshot(project, [second.id, first.id], 3);
    const replacement = await upload('replacement', 'new audio', first.id);

    expect(replacement.id).toBe(first.id);
    expect(replacement.version).not.toBe(first.version);

    await library.delete(second.id);

    const restarted = new MusicService(config, probe);

    await restarted.onModuleInit();

    const retained = await restarted.snapshot(
      project,
      [second.id, first.id],
      4,
      saved,
    );

    expect(retained.snapshots.map((track) => track.version)).toEqual(
      saved.snapshots.map((track) => track.version),
    );
    expect(
      await fs.readFile(join(project, retained.snapshots[0].filePath), 'utf8'),
    ).toBe('original second');
    expect(
      await fs.readFile(join(project, retained.snapshots[1].filePath), 'utf8'),
    ).toBe('original first');
  });

  it('migrates WAVs and MP3s once in filename order, reports invalid files, and distinguishes an empty selection', async () => {
    const ambient = join(root, 'legacy');

    await fs.mkdir(ambient);
    await Promise.all(
      ['b.wav', 'a.wav', 'bad.wav', 'c.MP3'].map((file) =>
        fs.writeFile(join(ambient, file), 'audio'),
      ),
    );

    jest.spyOn(probe, 'validate').mockImplementation(async (path) => {
      await fs.stat(path);

      if (path.endsWith('bad.wav')) {
        throw new Error('invalid WAV');
      }

      return { durationSeconds: 2, sizeBytes: 5 };
    });

    const migrated = new MusicService(
      new ConfigService({ AMBIENT_DIR: ambient }),
      probe,
    );
    const catalog = await migrated.list();

    expect(catalog.tracks.map((track) => track.originalFilename)).toEqual([
      'a.wav',
      'b.wav',
      'c.MP3',
    ]);
    expect(catalog.importErrors).toHaveLength(1);

    const project = join(root, 'legacy-project');

    await fs.mkdir(project);

    expect(
      (await migrated.snapshot(project, undefined, 0)).selectedTrackIds,
    ).toEqual(catalog.tracks.map((track) => track.id));
    expect((await migrated.snapshot(project, [], 1)).snapshots).toEqual([]);

    await fs.writeFile(join(ambient, 'new.wav'), 'new');

    const restarted = new MusicService(
      new ConfigService({ AMBIENT_DIR: ambient }),
      probe,
    );

    expect((await restarted.list()).tracks.map((track) => track.id)).toEqual(
      catalog.tracks.map((track) => track.id),
    );
  });

  it('cleans rejected uploads and does not publish failed probes or incomplete catalog updates', async () => {
    const track = await upload('valid');
    const path = join(root, 'broken.tmp');

    await fs.writeFile(path, 'broken');

    jest.spyOn(probe, 'validate').mockRejectedValueOnce(new Error('bad probe'));

    await expect(
      library.upload({ path, originalname: 'broken.wav', size: 6 }),
    ).rejects.toThrow('bad probe');
    await expect(fs.stat(path)).rejects.toMatchObject({ code: 'ENOENT' });

    const rename = jest
      .spyOn(fs, 'rename')
      .mockRejectedValueOnce(new Error('interrupted'));

    await expect(library.rename(track.id, 'Not committed')).rejects.toThrow(
      'interrupted',
    );

    rename.mockRestore();

    const restarted = new MusicService(config, probe);

    await restarted.onModuleInit();

    expect((await restarted.list()).tracks[0].displayName).toBe('valid');
    expect(
      (await fs.readdir(join(root, 'ambient'))).filter((name) =>
        name.endsWith('.tmp'),
      ),
    ).toEqual([]);
  });

  it('reconciles orphan source versions and interrupted uploads at startup', async () => {
    await upload('valid');
    await fs.writeFile(
      join(root, 'ambient', 'sources', 'orphan.wav'),
      'orphan',
    );
    await fs.writeFile(
      join(root, 'ambient', '.uploads', 'interrupted'),
      'partial',
    );

    const restarted = new MusicService(config, probe);

    await restarted.onModuleInit();

    expect(await fs.readdir(join(root, 'ambient', '.uploads'))).toEqual([]);
    expect(await fs.readdir(join(root, 'ambient', 'sources'))).toHaveLength(1);
  });

  it('rejects traversal, duplicate selections and corrupt sources without committing dangling snapshots', async () => {
    const track = await upload('safe');
    const project = join(root, 'safe-project');

    await fs.mkdir(project);

    await expect(safeMusicPath(root, '../escape')).rejects.toThrow('outside');
    await expect(
      library.snapshot(project, [track.id, track.id], 0),
    ).rejects.toMatchObject({ status: 400 });

    const catalog = musicCatalogSchema.parse(
      JSON.parse(
        await fs.readFile(join(root, 'ambient', 'catalog.json'), 'utf8'),
      ),
    );

    await fs.writeFile(
      join(root, 'ambient', catalog.tracks[0].filePath),
      'corrupt',
    );

    expect((await library.list()).tracks[0].available).toBe(false);
    await expect(
      library.snapshot(project, [track.id], 0),
    ).rejects.toMatchObject({ status: 400 });
    expect(await fs.readdir(join(project, 'music'))).toEqual([]);
  });

  it('rejects directory symlinks outside the approved storage tree', async () => {
    const outside = join(root, 'outside');
    const inside = join(root, 'inside');

    await fs.mkdir(outside);
    await fs.mkdir(inside);
    await fs.writeFile(join(outside, 'test.wav'), 'audio');
    await fs.symlink(outside, join(inside, 'linked'), 'junction');

    await expect(safeMusicPath(inside, 'linked/test.wav')).rejects.toThrow(
      'Symbolic links',
    );
  });
});
