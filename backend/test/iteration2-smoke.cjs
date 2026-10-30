const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { ConfigService } = require('@nestjs/config');
const {
  StateManagerService,
} = require('../dist/modules/state/state-manager.service');
const { FfmpegService } = require('../dist/modules/audio/ffmpeg.service');
const {
  VideoLibraryService,
} = require('../dist/modules/video/video-library.service');
const {
  VideoNormalizerService,
} = require('../dist/modules/video/video-normalizer.service');
const {
  VideoInputsService,
} = require('../dist/modules/video/video-inputs.service');
const {
  VideoEffectsService,
} = require('../dist/modules/video/video-effects.service');
const {
  VideoFullService,
} = require('../dist/modules/video/video-full.service');
const { videoStyleSchema } = require('../dist/modules/video/schemas');
const { encoderArgs } = require('../dist/modules/video/utils');
const {
  profileSchema,
} = require('../dist/modules/state/schemas/profile.schema');
const {
  EffectGeneratorService,
} = require('../dist/modules/video/effect-generator.service');
const { ExportService } = require('../dist/modules/video/export.service');

test(
  'overlay normalization, procedural presets, silent video export and audio stems',
  { timeout: 180000 },
  async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'bsap-iteration2-'));
    const state = new StateManagerService(
      new ConfigService({ PROJECTS_DIR: root }),
    );
    const ffmpeg = new FfmpegService(new ConfigService(), state);
    const library = new VideoLibraryService(state, ffmpeg);
    const inputs = new VideoInputsService(state, library);
    const effects = new VideoEffectsService(state, library);
    const full = new VideoFullService(state, ffmpeg);
    const signal = new AbortController().signal;

    try {
      const project = await state.initProject(
        'Iteration two',
        profileSchema.parse({
          architectModel: 'test',
          writerModel: 'test',
          architectSystemPrompt: 'test',
          writerSystemPrompt: 'test',
          architectReasoningEffort: 'none',
          writerReasoningEffort: 'none',
          temperature: 0.7,
          ttsVoice: 'bm_george',
          ttsSpeed: 1,
          masteringConfig: {},
        }),
      );
      const id = project.projectId;
      const style = videoStyleSchema.parse({
        width: 160,
        height: 90,
        fps: 30,
        minClipDurationSec: 8,
        crossfadeSec: 1,
      });
      const source = join(root, 'base.mp4');
      const fx = join(root, 'fx.mp4');

      await ffmpeg.renderMedia(source, [
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=160x90:rate=30:duration=12',
        ...encoderArgs(style),
      ]);
      await ffmpeg.renderMedia(fx, [
        '-f',
        'lavfi',
        '-i',
        'color=black:size=160x90:rate=30:duration=2',
        '-vf',
        'drawbox=x=30:y=30:w=10:h=10:color=white:t=fill',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
      ]);

      const clip = await library.upload(id, {
        path: source,
        originalname: 'base.mp4',
        size: (await fs.stat(source)).size,
      });
      const effect = await effects.upload(id, {
        path: fx,
        originalname: 'particles.mp4',
        size: (await fs.stat(fx)).size,
      });

      await state.updateState(id, (current) => {
        current.video.style = style;
        current.video.effectAssignments = { [clip.id]: [effect.id] };
      });

      const normalized = await new VideoNormalizerService(
        ffmpeg,
        state,
        library,
      ).normalize(id, clip, style, signal);
      const probe = await ffmpeg.probeMedia(normalized.path);

      assert.equal(probe.streams[0].width, 160);
      assert.equal(probe.streams[0].height, 90);

      const generator = new EffectGeneratorService(state, ffmpeg, effects);
      const { execa } = await import('execa');

      for (const presetKind of [
        'marine_snow',
        'bubbles_rising',
        'light_rays',
        'dust_motes',
        'plankton_sparkle',
      ]) {
        const preset = await generator.generate(
          id,
          { presetKind, seed: 17 },
          signal,
        );
        const media = await execa(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            state.getArtifactPath(id, preset),
            '-vf',
            'scale=80:46,format=gray',
            '-f',
            'rawvideo',
            '-',
          ],
          { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
        );
        const frameSize = 80 * 46;
        const count = media.stdout.length / frameSize;
        const diff = (a, b) => {
          let sum = 0;

          for (let pixel = 0; pixel < frameSize; pixel += 1) {
            sum += Math.abs(
              media.stdout[a * frameSize + pixel] -
                media.stdout[b * frameSize + pixel],
            );
          }

          return sum / frameSize;
        };

        assert.ok(
          diff(0, count - 1) <= diff(0, 1) * 4 + 2,
          `${presetKind} loop seam`,
        );
        const detail = await execa(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            state.getArtifactPath(id, preset),
            '-frames:v',
            '1',
            '-vf',
            'format=gray',
            '-f',
            'rawvideo',
            '-',
          ],
          { encoding: 'buffer', maxBuffer: 1024 * 1024 },
        );

        assert.ok(
          detail.stdout.some((value) => value > 30),
          `${presetKind} visible content at source resolution`,
        );

        if (process.env.VIDEO_DEBUG_DIR) {
          await fs.mkdir(process.env.VIDEO_DEBUG_DIR, { recursive: true });
          await ffmpeg.renderMedia(
            join(process.env.VIDEO_DEBUG_DIR, `${presetKind}.png`),
            ['-i', state.getArtifactPath(id, preset), '-frames:v', '1'],
          );
        }
      }

      await state.updateState(id, (current) => {
        current.video.cycle = {
          path: clip.filePath,
          planHash: 'synthetic',
          duration: 12,
          fps: 30,
          loop: true,
        };
      });

      const path = await full.build(id, 25, signal, () => {});
      const result = await ffmpeg.probeMedia(state.getArtifactPath(id, path));

      assert.ok(
        Math.abs(Number(result.format.duration) - 25) <= 1 / 30 + 0.001,
      );
      assert.equal(
        result.streams.some((stream) => stream.codec_type === 'audio'),
        false,
      );

      const before = await fs.stat(state.getArtifactPath(id, path));

      assert.equal(await full.build(id, 25, signal, () => {}), path);
      assert.equal(
        (await fs.stat(state.getArtifactPath(id, path))).mtimeMs,
        before.mtimeMs,
      );
      await full.build(id, 17.1, signal, () => {});

      const audioPath = 'output/test.wav';

      await ffmpeg.renderMedia(state.getArtifactPath(id, audioPath), [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=300:sample_rate=24000:duration=1',
        '-c:a',
        'pcm_s16le',
      ]);

      await state.updateState(id, (current) => {
        current.outputFiles = {
          narration: audioPath,
          wav: audioPath,
          backgroundMusic: audioPath,
        };
        current.mixNeedsRebuild = false;
      });
      await ffmpeg.renderMedia(
        state.getArtifactPath(id, 'output/ambient_cycle.wav'),
        [
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=200:sample_rate=24000:duration=0.5',
          '-c:a',
          'pcm_f32le',
        ],
      );

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
  },
);
