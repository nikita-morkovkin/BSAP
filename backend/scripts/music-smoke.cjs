const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { ConfigService } = require('@nestjs/config');
const { MusicService } = require('../dist/modules/music/music.service');
const { MusicProbeService } = require('../dist/modules/music/music-probe.service');
const { ProjectMusicService } = require('../dist/modules/music/project-music.service');
const { StateManagerService } = require('../dist/modules/state/state-manager.service');
const { FfmpegService } = require('../dist/modules/audio/ffmpeg.service');
const { MetadataExporterService } = require('../dist/modules/audio/metadata-exporter.service');
const { profileSchema } = require('../dist/modules/state/schemas/profile.schema');

async function main() {
  const root = await fs.mkdtemp(join(tmpdir(), 'bsap-music-smoke-'));

  try {
    const config = new ConfigService({ AMBIENT_DIR: join(root, 'ambient'), PROJECTS_DIR: join(root, 'projects') });
    const probe = new MusicProbeService(config);
    const library = new MusicService(config, probe);
    const manager = new StateManagerService(config);
    const queue = { isPaused: async () => false, pause: async () => {}, resume: async () => {}, getJobs: async () => [] };
    const music = new ProjectMusicService(manager, library, queue, queue, queue, queue);
    const masteringQueue = { enqueueProject: async () => {} };
    const exporter = new MetadataExporterService(manager);
    const engine = new FfmpegService(config, manager, masteringQueue, exporter, music);
    const render = engine.render.bind(engine);
    let ambientInputs = [];

    engine.render = async (destination, args) => {
      if (destination.endsWith('ambient_cycle.wav')) {
        ambientInputs = args.filter((value, index) => index > 0 && args[index - 1] === '-i');
      }

      return render(destination, args);
    };

    await library.onModuleInit();

    const createWav = (name, frequency) => {
      const path = join(root, name);

      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=2`, path]);

      return path;
    };
    const upload = async (name, frequency, id) => {
      const path = createWav(name, frequency);

      return library.upload({ path, originalname: name, size: (await fs.stat(path)).size }, undefined, id);
    };
    const first = await upload('first.MP3', 80);
    const second = await upload('second.wav', 120);
    const profile = profileSchema.parse({
      architectModel: 'test', writerModel: 'test', architectReasoningEffort: 'high', writerReasoningEffort: 'none',
      temperature: 0.7, architectSystemPrompt: 'Outline', writerSystemPrompt: 'Narrate', ttsVoice: 'bm_george', ttsSpeed: 0.85,
      masteringConfig: { ambientCrossfadeSeconds: 0.1, paddingSeconds: 0.2, fadeOutSeconds: 0.2 },
    });
    const project = await manager.initProject('Music smoke', profile);
    const id = project.projectId;

    await music.initialize(id, [first.id]);

    assert.ok((await music.paths(id))[0].endsWith('.mp3'));

    const orderedProject = await manager.initProject('Ordered soundtrack', profile);

    await music.initialize(orderedProject.projectId, [second.id, first.id]);

    const voice = createWav('voice.wav', 220);

    await fs.copyFile(voice, manager.getArtifactPath(id, 'chapters/ch_01_master.wav'));
    await manager.updateState(id, (state) => {
      state.chapters['1'] = {
        chapterNumber: 1, title: 'Quiet', scriptStatus: 'COMPLETED', ttsStatus: 'COMPLETED',
        scriptFilePath: 'chapters/ch_01_raw.txt', audioFilePath: 'chapters/ch_01_master.wav', durationMs: 2000, chunks: [],
      };
    });
    await engine.masterProject(id);

    assert.equal((await manager.getState(id)).status, 'COMPLETED');
    assert.deepEqual(ambientInputs, await music.paths(id));
    assert.equal(ambientInputs.length, 1);

    const replacement = await upload('replacement.wav', 180, first.id);

    assert.notEqual(replacement.version, first.version);

    await library.delete(first.id);

    const restartedLibrary = new MusicService(config, probe);

    await restartedLibrary.onModuleInit();

    const restartedMusic = new ProjectMusicService(manager, restartedLibrary, queue, queue, queue, queue);
    const restartedEngine = new FfmpegService(config, manager, masteringQueue, exporter, restartedMusic);

    const orderedState = await manager.getState(orderedProject.projectId);

    assert.deepEqual(orderedState.music.selectedTrackIds, [second.id, first.id]);
    assert.deepEqual(await restartedMusic.paths(orderedProject.projectId), orderedState.music.snapshots.map((track) =>
      manager.getArtifactPath(orderedProject.projectId, track.filePath)));

    await restartedEngine.buildAmbientBed(orderedProject.projectId);

    await restartedEngine.masterProject(id);

    assert.equal((await manager.getState(id)).music.snapshots[0].version, first.version);
    assert.equal((await restartedMusic.paths(id)).length, 1);

    await restartedMusic.update(id, { revision: 0, selectedTrackIds: [] });
    await restartedEngine.masterProject(id);

    assert.equal(await restartedEngine.buildAmbientBed(id), null);
    assert.equal((await manager.getState(id)).mixRevision, 1);
    assert.ok((await restartedEngine.getDurationSeconds(manager.getArtifactPath(id, 'output/master_final.wav'))) > 2);

    const exportMetadata = exporter.export.bind(exporter);

    exporter.export = async (projectId) => {
      await exportMetadata(projectId);
      await manager.updateState(projectId, (state) => { state.music.revision += 1; });
    };

    await assert.rejects(restartedEngine.masterProject(id), /revision changed/);

    assert.deepEqual((await manager.getState(id)).outputFiles, {});

    exporter.export = exportMetadata;

    const source = createWav('limits.wav', 100);
    const mp3 = createWav('limits.mp3', 100);

    await probe.validate(mp3, 'mp3');
    await assert.rejects(probe.validate(source, 'mp3'), { status: 415 });
    await assert.rejects(probe.validate(mp3, 'wav'), { status: 415 });
    await assert.rejects(new MusicProbeService(new ConfigService({ MUSIC_MAX_UPLOAD_BYTES: 8 })).validate(mp3, 'mp3'), { status: 413 });
    await assert.rejects(new MusicProbeService(new ConfigService({ MUSIC_MAX_DURATION_SECONDS: 1 })).validate(mp3, 'mp3'), { status: 415 });

    await assert.rejects(new MusicProbeService(new ConfigService({ MUSIC_MAX_UPLOAD_BYTES: 8 })).validate(source), { status: 413 });
    await assert.rejects(new MusicProbeService(new ConfigService({ MUSIC_MAX_DURATION_SECONDS: 1 })).validate(source), { status: 415 });

    const truncated = (await fs.readFile(source)).subarray(0, 100);

    await fs.writeFile(join(root, 'truncated.wav'), truncated);
    await assert.rejects(probe.validate(join(root, 'truncated.wav')), { status: 415 });
    await fs.writeFile(join(root, 'spoof.wav'), 'not audio');
    await assert.rejects(probe.validate(join(root, 'spoof.wav')), { status: 415 });
    await assert.rejects(probe.validate(join(root, 'spoof.wav'), 'mp3'), { status: 415 });

    const ordered = await restartedLibrary.snapshot(manager.getProjectDirectory(id), [second.id], 2);

    assert.deepEqual(ordered.selectedTrackIds, [second.id]);

    console.log('PASS: real WAV/MP3 validation, MP3 and mixed-format mastering, restart, immutable cross-format replacement/deletion snapshots, narration-only mastering, limits, spoof/truncation rejection');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});