# Iteration 2 implementation status

## Implemented

- Unified artifact registry, native browser downloads with Range support, lazy
  FLAC/WAV/MP3/AAC conversions, streaming stored ZIP, explicit video-only jobs.
- Uploaded overlay library, validated edit/delete endpoints, ordered assignments
  (maximum two), percentage rules, deterministic phase offsets, Stage 1 cache keys,
  matching frame-preview filters, per-clip and bulk UI controls.
- Anti-banding option (default on), CRF 18/AQ mode 3, corrected player geometry and
  loop/full-length export copy. The soundtrack panel has one mount site; no
  duplicated mount was found.
- Separate Kokoro greeting segment, explicit generation/rebuild action, persisted
  timeline, local RMS/hysteresis VAD, speech/pause blending, single-source idle loop,
  circular/fullscreen composition, two-second-GOP head/body assembly, preview jobs,
  character uploads/roles, prompt helpers, waveform and placement UI.
- Five locally generated, seeded procedural overlay presets with cached output;
  provider abstraction with a Sync reference adapter, mock, explicit paid-submission
  confirmation, resumable jobs and local VAD fallback. Uploaded clips with native
  audio can be selected and used without narrator TTS. BSAP does not generate Veo
  clips; users create them externally and upload them.

## Architecture findings

1. Chapters contain chunk WAV files, normalized to 24 kHz mono with stored pauses.
   Mastering already retains `output/voice_raw_full.wav`. Narration exports reuse
   this unmastered stem and pad to mixed duration without a gain change.
2. `FfmpegService.buildAmbientBed` builds the saved soundtrack's ordered ambient
   cycle. Unity-gain export loops that float PCM cycle; mix-gain export uses the
   existing rendered music stem. No TTS is invoked by export conversion.
3. Kokoro uses the project's `ttsVoice` and `ttsSpeed`. Existing chunk regeneration
   is supported. Greeting synthesis is independent and only explicit user actions
   enqueue mix rebuilding. Chapter timestamp exports account for greeting length.
4. Encoder GOP is two seconds with B-frames disabled and a 90000 video timescale.
   Greeting heads reuse encoder settings and align their cut to that GOP.
5. There is no bearer-auth layer; Express `sendFile` handles large native browser
   downloads. Project IDs are ASCII slugs, so non-ASCII filenames cannot currently
   arise through project creation.
6. No external provider credentials are configured by default. The Sync adapter
   requires a server-side key and explicit paid confirmation. Native-audio mode uses
   audio from a user-uploaded clip; in-app Veo generation is not configured.

## Verified

- Previous run: backend build and 144 tests passed, 13 integration tests skipped by
  existing environment gates; targeted ESLint passed. Frontend production build and
  ESLint passed; no frontend tests were added.
- Current run: backend build passed; full backend suite passed (157 tests, 13 skipped).
  Frontend build, lint, and configured test command passed (zero tests are currently
  configured). Streaming 1 GiB sparse ZIP check passed: 1,073,741,956 bytes and
  ~39 MiB RSS growth.
- Current Windows host has no `ffmpeg` or `ffprobe` on PATH. Earlier runs of both
  synthetic checks passed in the existing `bsap-video-check:latest` container: the
  mixed-stock normalization/cycle/mux smoke and the overlay/VAD/greeting head-body/
  cache smoke. This run's attempts exceeded the command runner's 30-second limit
  before output. These synthetic checks are not real-footage visual sign-off.
- Video-job progress now shows a coarse ETA after sufficient reported progress.
  It is derived from elapsed time and overall percent, is explicitly labeled an
  estimate, and is not an artifact-conversion or per-clip normalization ETA.

## Remaining task 014 scope (not complete)

- In-app Veo clip generation and provider configuration are not implemented. Users
  generate Veo clips outside BSAP and can upload them; the native-audio mode uses the
  uploaded clip's audio. The reference Sync provider requires user-supplied server
  credentials and must not be treated as enabled by default. Preset unit checks cover
  seeded deterministic fields, but do not assert rendered loop-seam quality; there is
  no real-footage visual sign-off.
- Zipped image sequences are not accepted; upload a supported overlay video.
  Explicitly deferred: safe extraction needs a ZIP reader plus limits on archive
  entry count, expanded bytes, compression ratio, and normalized image ordering.
  The current change set only adds ZIP output, not ZIP ingestion; accepting archives
  without those protections would introduce a decompression/path traversal risk.
- No draggable fallback timing marker: greeting timing comes from its dedicated
  segment, not silencedetect. VAD re-analysis follows saved settings.
- No visual sign-off on representative real stock footage, alpha ProRes/VP9
  deployment samples, dark-gradient banding, all greeting placements, or perceptual
  loop quality for every procedural preset. Synthetic checks do not establish
  production visual quality or invisible seams on arbitrary footage.
- No current-run 4.5-hour throughput/A-V drift benchmark, provider cost estimate,
  exact per-row conversion progress, or per-clip re-normalization ETA.
- Existing pre-iteration outputs lack input hash provenance until rebuilt.
- FLAC creation is lazy and synchronous per download request; concurrent requests
  for the same conversion are deduplicated, but a first long conversion can take
  time before response headers are sent. Configure proxy timeouts accordingly.

## Commands

From `n:/Projects/BSAP/backend`: `npm run build`, `npm test -- --runInBand`.
Real media checks: `node --test test/video-smoke.cjs`,
`node --test test/iteration2-smoke.cjs`, `node --test test/zip-stream-smoke.cjs`.
FFmpeg/ffprobe must be available; checks can run in the existing backend image
with the backend directory mounted at `/app` and `--entrypoint node`.
From `n:/Projects/BSAP/frontend`: `npm run build`, `npm run lint`, `npm test`.
