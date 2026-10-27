# Stock video tracks

## Using the feature

Open a project and expand **Stock video track**. This section is available before
audio generation. Choose files, choose a folder, or drop folders/files. Uploads run
three at a time with individual progress, error reporting, and retry. Originals
are streamed to temporary disk files, not buffered in application memory.

Adjust **Dark Sleep**, **Soft Dim**, or **Natural** grading. Settings autosave after
500 ms; the selected sample's graded frame updates after 300 ms. Build a video
cycle before audio exists, or build a final video after audio mastering completes.
Use **Mux cycle with audio** when audio becomes available or changes. No script
or TTS work is invoked by video operations. Preview, cycle, and final MP4 players
support seeking through Express HTTP Range responses.

Builds have one BullMQ worker (`video`, concurrency one). Normalization is
deliberately sequential to keep resource consumption conservative. Completed
normalizations/chunks/cycles/finals are reused by hash. Cancel interrupts the
active FFmpeg child; temporary media is renamed only after successful processing.
Interrupted jobs are marked failed on startup; retry reuses completed artifacts.
Queued jobs remain in Redis. Deployment is intended for one backend instance.

## Existing architecture / step-zero findings

- Project IDs are sequential topic slugs, e.g. `001-quiet-stars`.
- `n:/Projects/BSAP/backend/src/modules/state/state-manager.service.ts` owns
  locked, atomic `state.json` persistence. Video settings/latest job/output
  references extend its validated state, without changing audio status.
- Default storage is `n:/Projects/BSAP/projects/<projectId>/`. Existing audio
  directories are `chapters/`, `chunks/`, and `output/`.
- `n:/Projects/BSAP/backend/src/modules/audio/ffmpeg.service.ts` implements
  `buildAmbientBed`, `output/ambient_cycle.wav`, and mastering to
  `output/master_final.wav` / `output/master_final.flac`.
  `getFinalAudioInfo` resolves state output paths, probes duration, and includes
  size/mtime revision data. Video does not accept arbitrary audio filesystem paths.
- That FFmpeg wrapper previously supported neither video probing nor progress /
  cancellation. `probeMedia` and atomic `renderMedia` now supply those capabilities.
  Existing user modifications to audio grading/mastering were preserved.
- BullMQ/Redis already exist; the feature reuses them. Existing project/audio
  monitoring polls REST. Video adds SSE with continued two-second REST polling
  for reconnection/page reload and late audio availability.
- Frontend: React 19, Axios domain API/aggregator, TanStack Query, Zustand,
  Tailwind and Base UI. There is no translation framework or browser E2E runner.
  Video strings are centralized in a resource constant rather than introducing
  a new library. Clip grids use 24-item pagination instead of adding react-window.
- `n:/Projects/BSAP/frontend/vite.config.ts` proxies `/api`; no nginx upload limit
  is configured in the repository. External proxies must allow 1 GiB per file
  and suitably long upload requests. Browser uploads use one file per request.
- Runtime Docker image already includes FFmpeg/libx264. Host Windows PATH did
  not include FFmpeg. CPU/RAM/NVENC deployment guarantees are unknown; no untested
  NVENC encoder or new runtime dependency was introduced.

## Video storage and configuration

Per project:

```text
video/library/<sha256-prefix>/original.<ext>, thumb.jpg, meta.json
video/normalized/<clipId>__<normalizationHash>.mp4
video/chunks/<planHash>/chunk_0000.mp4, concat.txt
video/cycle/master_cycle_<planHash>.mp4
video/preview/frame_<hash>.jpg
video/final/final_<audio-and-cycle-hash>.mp4
```

Preview movies reuse the bounded cycle/chunk stores; `state.video.preview` selects
the result. Changing seed/crossfade/mirroring does not invalidate normalization.
Clear video cache deletes downstream media but retains original uploads and
settings. Deleting a clip currently clears all downstream caches for correctness,
rather than surgically retaining unaffected plans. Metadata normalization
durations are ignored when their corresponding cache file is absent.

Environment settings in `n:/Projects/BSAP/backend/.env.example`:

| Setting | Default |
| --- | --- |
| `VIDEO_MAX_UPLOAD_BYTES` | 1073741824 per file |
| `VIDEO_CHUNK_SIZE` | 10 (clamped 2–12) |
| `VIDEO_FFMPEG_TIMEOUT_MS` | 7200000 per invocation |
| `VIDEO_DEBUG` | 0; set to 1 to extract chunk-seam JPEG pairs |
| `FFMPEG_PATH`, `FFPROBE_PATH` | ffmpeg, ffprobe |

## Rendering decisions and deviations

- All planning/cut calculations are frame-quantized. Time offsets use six decimal
  places rather than three to avoid introducing a millisecond rounding error.
- Chunks share one input, but trim their contribution **inside their encode**.
  The next contribution begins at the shared input's outgoing dissolve. Whole
  chunk files start on keyframes and can be concatenated without demuxer
  `inpoint` pre-roll. This is equivalent to the planned global cut intervals.
- All encodes use the same H.264 profile, level, pixel format, fps, GOP,
  timescale, CRF and preset (except low-resolution ultrafast previews).
  B-frames are disabled consistently: real-media testing found reordered tail
  packets could exceed final audio duration during stream-copy truncation.
- Loop closing keeps the first clip's mirror flag and takes `[X, S+X]`.
  Single-clip libraries necessarily repeat the same clip; adjacency exclusion is
  enforced for libraries with at least two clips. Across bag boundaries the
  repeat window is `min(5, floor(n/2))`: the requested full exclusion is
  mathematically impossible for small libraries. Larger libraries use five.
- Non-looping plans are cut to the audio duration and fade the final chunk to
  black. Loop mode intentionally has no final fade-to-black; it stream-copies
  the cycle to audio length without encoding hours of footage.
- Durations are validated after stitching (with bounded-cycle re-encode fallback)
  and muxing. Final tolerance includes one video frame plus 25 ms for AAC packet
  duration. No shell or arbitrary user-supplied filter expression is used.
- Slow-motion extension is self-crossfade only. Reverse, minterpolate, automatic
  mux, and hardware encoding are not enabled. A later audio duration change can
  reuse looping cycles; longer audio requires rebuilding a non-looping timeline.

## Validation

```text
cd n:/Projects/BSAP/backend
npm run build
npm test -- --runInBand
npx eslint src/modules/video
node --test test/video-smoke.cjs    # requires ffmpeg/ffprobe on PATH

cd n:/Projects/BSAP/frontend
npm test
npm run lint
npm run build
```

The real-FFmpeg smoke test generates six 3–8-second sources at mixed frame rates /
resolutions. It runs upload, normalization, K=3 chunks, cycle stitching, decoded
frame seam comparisons, audio mux, cache reuse, and process cancellation in an
isolated temporary project. It was run using FFmpeg 6.1.2 in the existing backend
container, without replacing the running application's code or project data.
Frontend hook tests use the existing Node test/TypeScript tooling with lightweight
hook adapters (not a browser DOM); they cover upload concurrency/retry/filtering,
frame debounce/abort, SSE/polling fallback, and recursive folder traversal.

## Remaining acceptance work / limitations

- No 100-clip / 4.5-hour production benchmark was run. Peak RSS below 2 GiB,
  mux wall time below two minutes, real-stock visual quality, and multihour A/V
  drift remain deployment acceptance tests, not verified performance claims.
- No Playwright/Cypress dependency is present, so browser E2E was not added.
- Normalization is sequential; it does not yet offer a configurable two-worker
  pool. Preview selection is deterministic and seed-dependent, and preview
  duration can exceed 30 seconds by one clip when a closing dissolve is needed.
- Only the latest job per project is exposed. Full job history, cache-ratio ETA,
  output file-size UI, status filtering, and bulk deletion are not implemented.
- Clear cache is explicit, not automatic orphan garbage collection. A hard API
  process kill can leave uniquely named `.tmp` media for manual cleanup; those
  files are never treated as valid cache entries.
- Multipart ffprobe errors are per-file. Multer transport failures (oversize or
  interrupted requests) reject that request; the one-file browser upload strategy
  isolates these failures from the rest of the upload session.
- The upload library is local-trust, not a multi-tenant service. Concurrent
  duplicate uploads and multiple API instances sharing one project directory
  are not supported coordination scenarios.