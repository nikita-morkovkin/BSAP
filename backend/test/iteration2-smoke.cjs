const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const { StateManagerService } = require('../dist/modules/state/state-manager.service');
const { FfmpegService } = require('../dist/modules/audio/ffmpeg.service');
const { VideoLibraryService } = require('../dist/modules/video/video-library.service');
const { VideoNormalizerService } = require('../dist/modules/video/video-normalizer.service');
const { VideoInputsService } = require('../dist/modules/video/video-inputs.service');
const { VideoEffectsService } = require('../dist/modules/video/video-effects.service');
const { GreetingVadService } = require('../dist/modules/video/greeting-vad.service');
const { GreetingRendererService } = require('../dist/modules/video/greeting-renderer.service');
const { GreetingCompositorService } = require('../dist/modules/video/greeting-compositor.service');
const { VideoFullService } = require('../dist/modules/video/video-full.service');
const { videoStyleSchema, greetingSchema } = require('../dist/modules/video/schemas');
const { videoHash, encoderArgs } = require('../dist/modules/video/utils');
const { profileSchema } = require('../dist/modules/state/schemas/profile.schema');
const { EffectGeneratorService } = require('../dist/modules/video/effect-generator.service');
const { GreetingAudioService } = require('../dist/modules/video/greeting-audio.service');
const { KokoroTtsAdapter } = require('../dist/modules/tts/kokoro-tts.adapter');
const { TextNormalizerService } = require('../dist/modules/text/text-normalizer.service');
const { MasterProjectQueueService } = require('../dist/modules/audio/master-project-queue.service');
const { ExportService } = require('../dist/modules/video/export.service');

test('overlay normalization, greeting VAD, circular head/body export and head cache reuse', { timeout: 180000 }, async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'bsap-iteration2-'));
  const state = new StateManagerService(new ConfigService({ PROJECTS_DIR: root }));
  const ffmpeg = new FfmpegService(new ConfigService(), state);
  const library = new VideoLibraryService(state, ffmpeg);
  const inputs = new VideoInputsService(state, library);
  const effects = new VideoEffectsService(state, library);
  const renderer = new GreetingRendererService(state, ffmpeg, library, new GreetingVadService(state, ffmpeg), inputs);
  const compositor = new GreetingCompositorService(state, ffmpeg, renderer);
  const full = new VideoFullService(state, ffmpeg, compositor, inputs);
  const signal = new AbortController().signal;

  try {
    const project = await state.initProject('Iteration two', profileSchema.parse({ architectModel: 'test', writerModel: 'test', architectSystemPrompt: 'test', writerSystemPrompt: 'test', architectReasoningEffort: 'none', writerReasoningEffort: 'none', temperature: 0.7, ttsVoice: 'bm_george', ttsSpeed: 1, masteringConfig: {} }));
    const id = project.projectId;
    const style = videoStyleSchema.parse({ width: 160, height: 90, fps: 30, minClipDurationSec: 8, crossfadeSec: 1 });
    const source = join(root, 'base.mp4');
    const fx = join(root, 'fx.mp4');

    await ffmpeg.renderMedia(source, ['-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30:duration=12', ...encoderArgs(style)]);
    await ffmpeg.renderMedia(fx, ['-f', 'lavfi', '-i', 'color=black:size=160x90:rate=30:duration=2', '-vf', 'drawbox=x=30:y=30:w=10:h=10:color=white:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);

    const clip = await library.upload(id, { path: source, originalname: 'base.mp4', size: (await fs.stat(source)).size });
    const effect = await effects.upload(id, { path: fx, originalname: 'particles.mp4', size: (await fs.stat(fx)).size });

    await state.updateState(id, (current) => { current.video.style = style; current.video.effectAssignments = { [clip.id]: [effect.id] }; });

    const normalized = await new VideoNormalizerService(ffmpeg, state, library).normalize(id, clip, style, signal);
    const probe = await ffmpeg.probeMedia(normalized.path);

    assert.equal(probe.streams[0].width, 160);
    assert.equal(probe.streams[0].height, 90);

    const generator = new EffectGeneratorService(state, ffmpeg, effects);
    const { execa } = await import('execa');

    for (const presetKind of ['marine_snow', 'bubbles_rising', 'light_rays', 'dust_motes', 'plankton_sparkle']) {
      const preset = await generator.generate(id, { presetKind, seed: 17 }, signal);
      const media = await execa('ffmpeg', ['-v', 'error', '-i', state.getArtifactPath(id, preset), '-vf', 'scale=80:46,format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
      const frameSize = 80 * 46;
      const count = media.stdout.length / frameSize;
      const diff = (a, b) => {
        let sum = 0;

        for (let pixel = 0; pixel < frameSize; pixel += 1) {
          sum += Math.abs(media.stdout[a * frameSize + pixel] - media.stdout[b * frameSize + pixel]);
        }

        return sum / frameSize;
      };

      assert.ok(diff(0, count - 1) <= diff(0, 1) * 4 + 2, `${presetKind} loop seam`);
      const detail = await execa('ffmpeg', ['-v', 'error', '-i', state.getArtifactPath(id, preset), '-frames:v', '1', '-vf', 'format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 1024 * 1024 });

      assert.ok(detail.stdout.some((value) => value > 30), `${presetKind} visible content at source resolution`);

      if (process.env.VIDEO_DEBUG_DIR) {
        await fs.mkdir(process.env.VIDEO_DEBUG_DIR, { recursive: true });
        await ffmpeg.renderMedia(join(process.env.VIDEO_DEBUG_DIR, `${presetKind}.png`), ['-i', state.getArtifactPath(id, preset), '-frames:v', '1']);
      }
    }

    const character = await library.upload(id, { path: source, originalname: 'character.mp4', size: (await fs.stat(source)).size }, 'character');

    character.role = 'greeting_source';

    await library.save(id, character, 'character');

    const audioPath = 'video/character/test.wav';
    const config = greetingSchema.parse({ enabled: true, text: 'Hello', leadInSec: 0.6, tailSec: 0.3, pip: { fadeOutSec: 0.3 } });

    await ffmpeg.renderMedia(state.getArtifactPath(id, audioPath), ['-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=24000:duration=1', '-c:a', 'pcm_s16le']);
    await state.updateState(id, (current) => {
      current.video.greeting = config;
      current.video.greetingAudio = { path: audioPath, startSec: 0.6, endSec: 1.6, hash: videoHash({ text: 'Hello', voice: 'bm_george', speed: 1 }) };
      current.video.cycle = { path: clip.filePath, planHash: 'synthetic', duration: 12, fps: 30, loop: true };
    });

    const path = await full.build(id, 25, signal, () => {}, true);
    const result = await ffmpeg.probeMedia(state.getArtifactPath(id, path));

    assert.ok(Math.abs(Number(result.format.duration) - 25) <= 1 / 30 + 0.001);
    assert.equal(result.streams.some((stream) => stream.codec_type === 'audio'), false);

    const heads = (await fs.readdir(state.getArtifactPath(id, 'video/character'))).filter((name) => name.startsWith('head_'));
    const before = await fs.stat(state.getArtifactPath(id, `video/character/${heads[0]}`));

    await full.build(id, 26, signal, () => {}, true);

    assert.equal((await fs.stat(state.getArtifactPath(id, `video/character/${heads[0]}`))).mtimeMs, before.mtimeMs);
    await full.build(id, 17.1, signal, () => {}, false);

    const nativeSource = join(root, 'native.mp4');

    await ffmpeg.renderMedia(nativeSource, ['-i', source, '-f', 'lavfi', '-i', 'sine=frequency=400:sample_rate=24000:duration=1', '-map', '0:v', '-map', '1:a', '-t', '1', '-c:v', 'copy', '-c:a', 'aac']);

    const nativeClip = await library.upload(id, { path: nativeSource, originalname: 'native.mp4', size: (await fs.stat(nativeSource)).size }, 'character');

    await state.updateState(id, (current) => {
      current.video.greeting = { ...config, lipSyncMode: 'native_veo_audio', nativeClipId: nativeClip.id };
    });

    const tts = new KokoroTtsAdapter(new ConfigService({ KOKORO_TTS_URL: 'http://unused', KOKORO_TIMEOUT_MS: 1000 }));

    tts.synthesize = async () => { throw new Error('Native mode must not call TTS'); };

    await new GreetingAudioService(state, tts, new TextNormalizerService(), ffmpeg, new MasterProjectQueueService(), library).regenerate(id, signal);

    const nativeAudio = (await state.getState(id)).video.greetingAudio;

    assert.ok(Math.abs(nativeAudio.endSec - nativeAudio.startSec - 1) < 0.1);
    await renderer.render(id, signal);
    await full.build(id, 25, signal, () => {}, true);

    await state.updateState(id, (current) => {
      current.outputFiles = { narration: nativeAudio.path, flac: nativeAudio.path, backgroundMusic: nativeAudio.path };
      current.mixNeedsRebuild = false;
    });
    await ffmpeg.renderMedia(state.getArtifactPath(id, 'output/ambient_cycle.wav'), ['-f', 'lavfi', '-i', 'sine=frequency=200:sample_rate=24000:duration=0.5', '-c:a', 'pcm_f32le']);

    const exports = new ExportService(state, ffmpeg, inputs);

    for (const kind of ['narration', 'background_music']) {
      const path = await exports.resolve(id, kind, 'flac');
      const result = await ffmpeg.probeMedia(path);

      assert.ok(Math.abs(Number(result.format.duration) - 1) < 0.1);
      assert.equal(result.streams[0].sample_rate, '24000');
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});