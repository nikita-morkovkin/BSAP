// Run after npm run build: node --test test/video-smoke.cjs
// Requires ffmpeg + ffprobe. No Redis, HTTP server, or project data is modified.
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
const { VideoPlannerService } = require('../dist/modules/video/video-planner.service');
const { VideoChunkRendererService } = require('../dist/modules/video/video-chunk-renderer.service');
const { VideoFinalMuxService } = require('../dist/modules/video/video-final-mux.service');
const { videoStyleSchema } = require('../dist/modules/video/schemas');
const { profileSchema } = require('../dist/modules/state/schemas/profile.schema');

test('mixed stock clips → normalized cache → K=3 chunks → seamless cycle → audio mux', { timeout: 180000 }, async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'bsap-video-'));
  const config = new ConfigService({ PROJECTS_DIR: directory, VIDEO_CHUNK_SIZE: 3 });
  const state = new StateManagerService(config);
  const ffmpeg = new FfmpegService(config, state);
  const library = new VideoLibraryService(state, ffmpeg);
  const normalizer = new VideoNormalizerService(ffmpeg, state, library);
  const planner = new VideoPlannerService();
  const renderer = new VideoChunkRendererService(ffmpeg, library, config);
  const muxer = new VideoFinalMuxService(ffmpeg, state, library);
  const signal = new AbortController().signal;

  try {
    const project = await state.initProject('Video synthetic smoke', profileSchema.parse({
      architectModel: 'test', writerModel: 'test', architectSystemPrompt: 'test', writerSystemPrompt: 'test',
      architectReasoningEffort: 'none', writerReasoningEffort: 'none', temperature: 0.7,
      ttsVoice: 'bm_george', ttsSpeed: 1, masteringConfig: {},
    }));
    const id = project.projectId;
    const style = videoStyleSchema.parse({ width: 160, height: 90, fps: 30, cycleTargetMinutes: 0.5, minClipDurationSec: 8, crossfadeSec: 1.5 });
    const clips = [];

    for (const [index, fps] of [24, 25, 30, 60, 24, 30].entries()) {
      const source = join(directory, `source_${index}.mp4`);

      await ffmpeg.renderMedia(source, ['-f', 'lavfi', '-i', `testsrc2=size=${index % 2 ? '240x160' : '160x120'}:rate=${fps}:duration=${3 + index}`, '-vf', `hue=h=${index * 30}`, '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p']);

      const clip = await library.upload(id, { path: source, originalname: `stock_${index}.mp4`, size: (await fs.stat(source)).size });

      clips.push(clip);
    }

    assert.equal((await library.list(id)).length, 6);

    const normalized = [];

    for (const clip of clips) {
      const output = await normalizer.normalize(id, clip, style, signal);
      const probe = await ffmpeg.probeMedia(output.path);

      assert.equal(probe.streams[0].width, 160);
      assert.equal(probe.streams[0].height, 90);
      assert.equal(probe.streams[0].pix_fmt, 'yuv420p');
      assert.equal(probe.streams[0].avg_frame_rate, '30/1');
      assert.deepEqual(await normalizer.normalize(id, clip, style, signal), output);

      normalized.push(output);
    }

    const plan = planner.plan(normalized, style);
    const cycle = await renderer.render(id, plan, style, signal, () => {});
    const cycleProbe = await ffmpeg.probeMedia(cycle);
    const expected = plan.loopWindow.endSec - plan.loopWindow.startSec;

    assert.ok(Math.abs(Number(cycleProbe.format.duration) - expected) < 0.1);

    // Compare decoded seam frames with a true neighbouring-frame baseline.
    const { execa } = await import('execa');
    const frames = await execa(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', cycle, '-vf', 'scale=80:46,format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
    const size = 80 * 46;
    const count = frames.stdout.length / size;
    const difference = (a, b) => {
      let sum = 0;

      for (let pixel = 0; pixel < size; pixel += 1) {
        sum += Math.abs(frames.stdout[a * size + pixel] - frames.stdout[b * size + pixel]);
      }

      return sum / size;
    };
    const neighbour = difference(0, 1);
    const seam = difference(count - 1, 0);

    assert.ok(seam < neighbour * 5 + 3, `Loop seam ${seam}, neighbouring frames ${neighbour}`);

    const slices = require('../dist/modules/video/utils/chunk-slices.util').chunkSlices(plan, 30, 3);
    let position = 0;

    for (const slice of slices.slice(0, -1)) {
      position += Math.round(slice.duration * 30);

      const cut = difference(position - 1, position);
      const baseline = difference(Math.max(0, position - 2), position - 1);

      assert.ok(cut < baseline * 5 + 3, `Chunk seam ${cut}, neighbouring frames ${baseline}`);
    }

    await state.updateState(id, (current) => {
      current.video = { style, cycle: { path: `video/cycle/${cycle.split(/[\\/]/).pop()}`, planHash: plan.planHash, duration: Number(cycleProbe.format.duration), loop: true, fps: 30 } };
    });

    const audio = state.getArtifactPath(id, 'output/master_final.wav');

    await ffmpeg.renderMedia(audio, ['-f', 'lavfi', '-i', `sine=frequency=100:duration=${expected + 3}`, '-c:a', 'pcm_s16le']);
    await state.updateState(id, (current) => { current.outputFiles.wav = 'output/master_final.wav'; });

    const final = await muxer.mux(id, signal, () => {});
    const finalProbe = await ffmpeg.probeMedia(state.getArtifactPath(id, final));

    assert.ok(finalProbe.streams.some((stream) => stream.codec_type === 'audio'));
    assert.ok(Math.abs(Number(finalProbe.format.duration) - expected - 3) < 0.06);
    assert.equal(await muxer.mux(id, signal, () => {}), final);

    const linearPlan = planner.plan(normalized, style, 12);
    const linear = await renderer.render(id, linearPlan, style, signal, () => {});
    const linearProbe = await ffmpeg.probeMedia(linear);

    assert.equal(linearPlan.loopWindow, undefined);
    assert.ok(Math.abs(Number(linearProbe.format.duration) - 12) < 1 / 30);

    const abort = new AbortController();
    const interrupted = join(directory, 'cancelled.mp4');
    const pending = ffmpeg.renderMedia(interrupted, ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:duration=30', '-c:v', 'libx264'], { signal: abort.signal });

    setTimeout(() => abort.abort(), 300);

    await assert.rejects(pending);
    await assert.rejects(fs.stat(interrupted));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});