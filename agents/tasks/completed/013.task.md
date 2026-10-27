# Implementation Plan: Stock Video Track Generation (Backend + Frontend)

Audience: AI coding agent working inside the existing monorepo (NestJS backend + React frontend).
Goal: let the user upload ~100 stock clips (5 s – 60 s each), then automatically produce a long, seamless, "sleep-grade" background video track and mux it with the already generated narration/ambient audio into a final YouTube-ready MP4.

---

## 0. Context and ground rules

### 0.1 What already exists (verify by reading the code first — do NOT assume)
- A pipeline that generates a script, synthesizes narration (TTS) and mixes background music. Final audio is a file such as `master_final.wav` / `master_final.flac`.
- `FfmpegService` (thin wrapper over ffmpeg/ffprobe, likely via `execa`).
- `StateManagerService` (project/job state persistence).
- An ambient bed builder (`buildAmbientBed`, `ambient_cycle.wav`) that already uses the "seamless cycle + loop" idea for audio.
- `ConfigService` with `FFMPEG_PATH` / `FFPROBE_PATH`.

**Step 0 task:** inspect these, list the exact file paths, the project directory layout, how jobs/progress are currently exposed to the frontend (REST polling / SSE / WebSocket), and how the frontend talks to the backend (axios / fetch / react-query). Reuse existing conventions. Where this document conflicts with existing conventions, follow the repo and note the deviation in the PR description.

### 0.2 Target look ("Dark Sleep" grade)
Reference: long sleep/ambient videos (4+ hours) built from bright underwater stock footage. Effects:
1. Strong darkening, reduced contrast and saturation, clipped highlights.
2. Soft vignette, slightly deep/teal-warm tone (avoid aggressive saturated blue).
3. Slow motion (x1.25 default, up to x2.0 for short clips).
4. Long cross-dissolves (2–4 s, default 3 s) between clips.

### 0.3 Hard technical constraints
- `xfade` and `concat` require identical resolution, SAR, pixel format, fps and timebase across inputs → every clip is normalized once and cached.
- Never feed 100 inputs into one `filter_complex` (OOM). Use chunked rendering.
- Never encode 4+ hours of unique video. Build one seamless **master cycle** and loop it with `-stream_loop -1 -c:v copy`.
- All durations used in offset math must be **frame-quantized**: `d = round(d_sec * fps) / fps`. Otherwise `xfade` offsets drift and chunk cuts miss keyframes.
- Output encoder settings must be identical across all intermediate files (same codec/profile/level/pix_fmt/timescale) so that `-c copy` concatenation is valid.

---

## 1. Pipeline overview

```
Upload ─► ffprobe + thumbnail ─► [Stage 1] Normalize (per clip, cached)
                                        │
        user style settings ────────────┤
                                        ▼
                         [Stage 2] Playlist planner (bag shuffle, mirror flags)
                                        ▼
                         [Stage 3] Chunked xfade render (≤ 10–12 clips/chunk, overlapped by 1 clip)
                                        ▼
                         [Stage 4] Keyframe-exact stitch (concat demuxer, -c copy) → master_cycle.mp4
                                        ▼
                         [Stage 5] Final mux: -stream_loop -1 master_cycle + master_final audio → final.mp4
```

Time-ordering requirement: the user may upload clips **before** the script/voice generation starts or **after** it finishes. The video stage only needs (a) the clip library and (b) the final audio duration. It must therefore be an independent, re-runnable step of a project, not hard-wired into the audio pipeline.

---

## 2. Backend (NestJS)

### 2.1 Module layout
Create a `video` module (adjust naming to repo conventions):

```
src/video/
  video.module.ts
  video.controller.ts            # REST API
  video-library.service.ts       # upload handling, metadata, thumbnails, deletion
  video-normalizer.service.ts    # Stage 1
  video-planner.service.ts       # Stage 2 (pure, unit-testable, no ffmpeg)
  video-chunk-renderer.service.ts# Stage 3 + 4
  video-final-mux.service.ts     # Stage 5
  video-preview.service.ts       # still frame + 30 s preview
  video-job.service.ts           # queue, progress, cancel
  dto/*.ts
  types.ts
```

Reuse `FfmpegService` for process spawning; if it lacks needed features (progress parsing, cancellation, stderr capture), extend it rather than duplicating `execa` calls.

### 2.2 Storage layout (per project)
```
<projectDir>/video/
  library/
    <clipId>/original.<ext>
    <clipId>/thumb.jpg
    <clipId>/meta.json              # ffprobe result + sha256
  normalized/<clipId>__<styleHash>.mp4
  chunks/<planHash>/chunk_0000.mp4 ...
  cycle/master_cycle_<planHash>.mp4
  preview/preview_<hash>.mp4, frame_<hash>.jpg
  final/final_<hash>.mp4
```
- `clipId` = sha256 of file content (first 16 hex chars) → free de-duplication of identical uploads.
- `styleHash` = hash of the settings that affect Stage 1 output (width, height, fps, brightness, contrast, saturation, gamma, vignette, slowMoFactor policy, minClipDuration). Changing style invalidates only `normalized/` and downstream; changing only crossfade/shuffle seed invalidates only Stage 2+.
- Add cleanup: delete orphaned cache files; endpoint/button "Clear video cache".

### 2.3 Types (`types.ts`)

```ts
export interface StockClipMeta {
  id: string;                 // content hash
  originalName: string;
  filePath: string;
  thumbPath: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
  sizeBytes: number;
  hasVideoStream: boolean;
  status: 'uploaded' | 'ready' | 'invalid';
  invalidReason?: string;
  enabled: boolean;           // user can exclude a clip without deleting it
}

export interface VideoStyleConfig {
  width: number;              // 1920
  height: number;             // 1080
  fps: number;                // 30
  minClipDurationSec: number; // 14
  maxClipDurationSec: number; // 45 – long inputs are trimmed after slow-mo (see 2.5)
  slowMoDefault: number;      // 1.25
  slowMoMax: number;          // 2.0
  crossfadeSec: number;       // 3.0 (range 1.5–5.0)
  transition: 'fade' | 'smoothleft' | 'dissolve';
  brightness: number;         // -0.22  (eq range -1..1)
  contrast: number;           // 0.88
  saturation: number;         // 0.75
  gamma: number;              // 0.85
  vignetteEnabled: boolean;
  vignetteAngle: string;      // 'PI/4'
  mirrorOnRepeat: boolean;    // hflip on every odd shuffle pass
  cycleTargetMinutes: number; // 45 (cap for master cycle length)
  seed?: number;              // deterministic shuffle
}

export type VideoJobStage =
  | 'queued' | 'normalizing' | 'planning' | 'rendering_chunks'
  | 'stitching' | 'muxing' | 'done' | 'failed' | 'cancelled';

export interface VideoJobState {
  jobId: string;
  projectId: string;
  stage: VideoJobStage;
  progress: number;           // 0..1 overall
  stageProgress: number;      // 0..1 within stage
  message?: string;
  error?: string;
  outputPath?: string;
}
```

### 2.4 REST API
All routes are scoped to a project; adapt prefix to the repo's routing style.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/projects/:id/video/clips` | multipart upload, one or many files (`multer` disk storage, **streamed to disk, never buffered in memory**). Returns created `StockClipMeta[]`. |
| `GET` | `/projects/:id/video/clips` | list clips with meta + normalization status. |
| `PATCH` | `/projects/:id/video/clips/:clipId` | toggle `enabled`. |
| `DELETE` | `/projects/:id/video/clips/:clipId` | remove clip + caches. |
| `GET` | `/projects/:id/video/clips/:clipId/thumb` | thumbnail JPEG. |
| `GET` | `/projects/:id/video/settings` / `PUT` | read/save `VideoStyleConfig` (persist through `StateManagerService`). |
| `POST` | `/projects/:id/video/preview/frame` | body: `{ clipId?, style }` → JPEG of one graded frame (fast, < 1 s). |
| `POST` | `/projects/:id/video/preview/clip` | body: `{ style }` → job producing a ~30 s preview from 3 random enabled clips at 640x360, `preset ultrafast`. |
| `POST` | `/projects/:id/video/build` | body: `{ style, audioPath? }` → starts full build job. If `audioPath` omitted, resolve project's `master_final.*` via `StateManagerService`; if audio does not exist yet, build **master cycle only** and mark it ready for later muxing. |
| `POST` | `/projects/:id/video/mux` | mux an existing master cycle with the (now available) final audio. |
| `GET` | `/projects/:id/video/jobs/:jobId` | job state. |
| `GET` | `/projects/:id/video/jobs/:jobId/events` | SSE progress stream (or reuse existing mechanism). |
| `POST` | `/projects/:id/video/jobs/:jobId/cancel` | kill ffmpeg child processes, mark `cancelled`. |
| `GET` | `/projects/:id/video/output` | download/stream final MP4 (support HTTP Range). |

Upload constraints: configurable max file size (default 1 GB), accepted extensions `.mp4 .mov .mkv .webm .m4v`, validate with ffprobe (reject files without a video stream). Limit multer parallelism; return per-file errors without failing the whole batch. Sanitize file names (never use client names as paths).

### 2.5 Stage 1 — Normalization (`VideoNormalizerService`)

Per clip, with concurrency limit `min(2, cpuCount/2)` (configurable), skip if cache file for `(clipId, styleHash)` exists.

1. `ffprobe` → duration, fps, size, **handle VFR** (`avg_frame_rate` vs `r_frame_rate`; if they differ, treat as VFR and rely on `fps=` filter).
2. Compute slow-mo factor:
   ```
   slow = slowMoDefault                       // 1.25
   if (dur * slow < minClipDurationSec)
       slow = min(slowMoMax, minClipDurationSec / dur)
   stretched = dur * slow
   ```
3. If `stretched > maxClipDurationSec` → trim to `maxClipDurationSec` (prefer a trim that starts a few seconds in, not at 0, to skip stock-footage intros). Rationale: 60 s clips make the cycle too repetitive-per-clip and inflate render time; the cap is configurable and can be disabled.
4. If `stretched < minClipDurationSec` after max slow-mo → **self-crossfade extension** (clip dissolves into itself): `split=2` + `xfade` with `internalFade = min(1.5, stretched/3)`; resulting duration `2*stretched - internalFade`. Repeat once more only if still too short.
5. **Do NOT use ping-pong (`reverse`) by default.** Reasons: (a) `reverse` buffers the entire clip in RAM — for 1080p that is ~3 MB/frame, a 60 s clip would need > 5 GB; (b) reversed fish/jellyfish swim backwards, which looks wrong. Offer it only as an opt-in for clips ≤ 12 s, applied **after** downscaling.
6. Filter chain (order matters):
   ```
   scale=W:H:force_original_aspect_ratio=increase,crop=W:H,setsar=1,
   setpts=<slow>*PTS,fps=<fps>,
   eq=brightness=<b>:contrast=<c>:saturation=<s>:gamma=<g>,
   [vignette=angle=<a>,]
   format=yuv420p
   ```
   Optional (feature-flagged, off by default because expensive): `minterpolate` for smoother slow-mo on low-fps sources.
7. Encode: `-an -c:v libx264 -preset veryfast -crf 20 -profile:v high -pix_fmt yuv420p -r <fps> -g <fps*2> -keyint_min <fps*2> -sc_threshold 0 -video_track_timescale 90000 -movflags +faststart`. Keep the exact same flags in every encode stage.
8. Frame-quantize and **re-probe the output** to store the real duration (don't trust the computed one). Persist `normalizedDurationSec` in `meta.json` keyed by `styleHash`.

Note: mirroring (`hflip`) is NOT baked in Stage 1; it is applied per-input in Stage 3 so cache stays valid.

### 2.6 Stage 2 — Playlist planner (`VideoPlannerService`, pure functions)

Inputs: normalized clips `{id, path, duration}`, `crossfadeSec X`, `targetSec`, `seed`, `mirrorOnRepeat`.

Define `cycleTarget = min(audioDurationSec, cycleTargetMinutes*60)`; if audio duration is unknown, use `cycleTargetMinutes`.

Algorithm:
1. **Bag randomizer** with seeded PRNG (use e.g. `mulberry32`; do not use `sort(() => Math.random() - 0.5)` — it is biased).
   - Each pass shuffles all enabled clips.
   - Constraint: the first `min(5, n-1)` clips of the new pass must not appear among the last 5 clips of the previous pass; also no two adjacent identical clips.
   - Odd-numbered passes get `mirror = true` when `mirrorOnRepeat`.
2. Append clips until effective length ≥ `cycleTarget`, where effective length = `Σ d_i − (n−1)·X`.
3. If total unique material already exceeds the audio duration → the plan is the final timeline itself, **no looping needed** (mux step uses plain `-c:v copy` without `-stream_loop`, plus a 3–5 s fade-to-black at the end handled by a short re-encode of the last chunk only).
4. Otherwise produce a **loop-closing sequence**: `[c_0, …, c_{n-1}, c_0']` where `c_0'` is a second reference to the first clip with identical mirror flag. The loop window is described in 2.8.
5. Output a `Plan`:
   ```ts
   interface PlanItem { clipId: string; path: string; duration: number; mirror: boolean; globalStart: number }
   interface Plan { items: PlanItem[]; crossfade: number; loopWindow?: { startSec: number; endSec: number }; totalSec: number; planHash: string }
   ```
   where `globalStart_i = Σ_{j<i} (d_j − X)`.

Unit-test this service heavily (determinism with seed, no adjacent duplicates, repeat-window constraint, loop-closing correctness, frame-quantized math).

### 2.7 Stage 3 — Chunked xfade render (`VideoChunkRendererService`)

- Split `plan.items` into chunks of `K` clips (default 10, max 12), with **stride K−1** so that consecutive chunks share exactly one clip (last clip of chunk k == first clip of chunk k+1). This overlap is what makes the chunk boundary a real cross-dissolve instead of a hard cut.
- Within a chunk, build `filter_complex`:
  ```
  [i:v]settb=AVTB,fps=<fps>[,hflip]       -> [v_i]
  [v_0][v_1]xfade=transition=<t>:duration=<X>:offset=<o_1> -> [x1]
  [x1][v_2]xfade=...:offset=<o_2>          -> [x2]
  ...
  ```
  with `o_i = Σ_{j<i} (d_j − X)` (local, frame-quantized, 3 decimals).
- Encode with the same settings as Stage 1 (`-preset fast -crf 21`, same GOP flags) and additionally **force keyframes at every planned cut time** (see 2.8): `-force_key_frames t1,t2,...`.
- Run chunks sequentially (or 2 in parallel max). Report progress by parsing `-progress pipe:1` (`out_time_us`) against the chunk's expected duration.
- Retry a failed chunk once; fail job with the ffmpeg stderr tail attached.

### 2.8 Stage 4 — Keyframe-exact stitching

Because chunks overlap by one clip, each chunk contributes only the part **before** the outgoing fade of its last clip, and the next chunk contributes from the **start** of that same fade:

For chunk `k` with first clip duration `d_first` and local end time `E_k`:
- `in_k  = (k == 0) ? loopStartOffset : d_first − X`
- `out_k = (k == last) ? lastOut : E_k − X`

(`d_first − X` is the local moment where the first clip's outgoing fade begins in chunk k; `E_k − X` is the local moment where the last clip's outgoing fade would begin — which is the same global instant.)

Loop-closing window (only in loop mode): the sequence ends with `c_0'`. Let `S` = `globalStart` of `c_0'`. The master cycle is the global interval `[X, S + X]`:
- `loopStartOffset = X` → applied as `in_0`.
- `lastOut = (local start of c_0' in the last chunk) + X`.
At time `S + X` the picture is `c_0'` at `X` seconds in, which is frame-identical to `c_0` at `X` seconds in → the loop seam is invisible.

Stitch with the concat demuxer and stream copy:
```
file 'chunk_0000.mp4'
inpoint 3.000
outpoint 412.333
file 'chunk_0001.mp4'
inpoint ...
```
```
ffmpeg -f concat -safe 0 -i list.txt -c copy -movflags +faststart master_cycle.mp4
```
Validation after stitching (required): ffprobe duration ≈ expected (±1 frame per seam), no non-monotonic DTS warnings, and extract frames around each seam into a debug folder when `VIDEO_DEBUG=1`.

**Fallback:** if cuts cannot be made keyframe-exact (validation fails), re-encode the stitch step in a single pass (`-c:v libx264 -crf 21`) and log a warning. Correctness over speed.

### 2.9 Stage 5 — Final mux (`VideoFinalMuxService`)

Looped mode:
```
ffmpeg -stream_loop -1 -i master_cycle.mp4 -i master_final.flac \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k \
  -t <audioDurationSec> -movflags +faststart final.mp4
```
- Use `-t <audioDurationSec>` (obtained from ffprobe of the audio) instead of relying only on `-shortest`.
- If a fade-out at the end is desired, run a tiny separate encode of the last ~5 s and concat it; do not re-encode the whole file.
- Non-looped mode: concat plan output directly with the audio, same flags without `-stream_loop`.
- Provide `-c:a copy` when the audio is already AAC.
- Output must play in YouTube without re-processing issues: H.264 High, yuv420p, `faststart`, constant fps.

### 2.10 Job system (`VideoJobService`)
- Single worker queue per instance with concurrency 1 for heavy stages (Stage 3–5); Stage 1 may use a small pool.
- Use the repo's existing queue (BullMQ/Redis) if present; otherwise an in-process queue persisted via `StateManagerService`.
- Jobs must survive an API restart: on boot, mark `running` jobs as `failed` (or resume at the last completed stage using cache files).
- Cancellation: track child PIDs, `SIGTERM` then `SIGKILL`, clean partial outputs (write to `*.tmp`, rename atomically on success).
- Idempotent stages: every stage checks for an existing output keyed by its hash and skips.
- Overall progress weights: normalize 30 %, render chunks 55 %, stitch 5 %, mux 10 % (tune later).

### 2.11 Error handling & resource safety
- Reject clips with no video stream, zero duration, or absurd resolution (> 8K).
- Free-disk check before build: estimate `normalized ≈ totalSourceSec × slow × ~1.2 MB/s`, chunks ≈ cycle length × ~1.5 MB/s, fail early with a clear message.
- Wrap every ffmpeg call: timeout (configurable), stderr tail on failure, `-nostdin`.
- Never interpolate user strings into filter graphs or shell; pass args as arrays; build filter graphs only from validated numeric config (clamp ranges server-side: brightness −1..1, contrast 0.5..1.5, saturation 0..1.5, gamma 0.5..1.5, crossfade 1..6, min clip 8..60).

### 2.12 Backend tests
- Unit: planner (deterministic seed, constraints, loop window math), slow-mo factor calc, filtergraph builder (snapshot tests of generated strings), cut-point math.
- Integration (small synthetic clips generated with `ffmpeg -f lavfi -i testsrc2`, 6 clips of 3–8 s at mixed fps 24/25/30/60): run Stages 1→4 end-to-end with `K=3`, assert resolution/fps/pix_fmt uniform, duration within tolerance, and that frames at chunk seams are continuous (compare SSIM/PSNR of neighbouring frames at the seam vs. mid-clip).
- Loop test: extract last frame of cycle and first frame of cycle → difference must be on the same order as two consecutive frames.

---

## 3. Frontend (React)

Follow the existing UI kit, state management and API client. Place the feature in a new screen/tab/section of the project page, e.g. **"Video"**, available both before and after audio generation. Use TypeScript types mirrored from the backend DTOs (share via a common package if the monorepo has one).

### 3.1 Component tree
```
VideoStep/
  VideoStepPage.tsx            # layout: three blocks + job panel
  StockLibrary/
    StockLibrary.tsx           # dropzone + grid/table
    ClipDropzone.tsx           # drag&drop + file picker, folder drop
    ClipCard.tsx               # thumbnail, name, duration, fps, resolution, badges, enable toggle, delete
    UploadQueue.tsx            # per-file progress, errors, retry
  StyleSettings/
    StyleSettingsPanel.tsx     # sliders/toggles bound to VideoStyleConfig
    StylePresets.tsx           # "Dark Sleep" (default), "Soft Dim", "Natural"
    FramePreview.tsx           # live single-frame preview (debounced)
  BuildPanel/
    BuildPanel.tsx             # summary + build/cancel buttons
    JobProgress.tsx            # stage list + progress bars
    OutputPlayer.tsx           # <video> for preview/final result
  hooks/
    useVideoClips.ts
    useVideoSettings.ts
    useVideoJob.ts             # SSE (EventSource) with polling fallback
    useClipUpload.ts
```

### 3.2 Stock library block
- Drag & drop zone accepting multiple files and whole folders (`webkitdirectory`/`DataTransferItem.webkitGetAsEntry`). Filter by extension client-side; show rejected files.
- **Upload strategy for ~100 files:** upload with `XMLHttpRequest` or axios `onUploadProgress`, concurrency limit 3, one request per file (so a single failure doesn't kill the batch), per-file progress + retry. Do not read files into memory (`File` objects only).
- Grid of `ClipCard`s (virtualize with `react-window` or similar if > 60 items). Each card shows: thumbnail, source duration (e.g. `5.4s`), fps (`24`, `60`), resolution, and badges:
  - `Ready` / `Processing` / `Invalid (reason)`
  - `Auto-stretched → 14s` when the planner will slow it down / extend it (compute from the same formula as backend; get the exact value from API field `plannedDurationSec`).
  - `VFR` warning if applicable.
- Selection + bulk actions: enable/disable, delete. Sorting/filtering by duration and status.
- Summary header: `N clips · total source 1h 12m · effective unique length after slow-mo ≈ 1h 30m · estimated cycle: 45 m`.
- Warn (non-blocking) when total unique footage is much shorter than the audio duration ("video will loop every ~X min") — informative, since looping is intended.

### 3.3 Style settings block
Controls (all map to `VideoStyleConfig`, ranges as in 2.11):
- Presets dropdown (default "Dark Sleep": brightness −0.22, contrast 0.88, saturation 0.75, gamma 0.85, vignette on, crossfade 3 s, slow-mo 1.25).
- Brightness, Contrast, Saturation, Gamma sliders with numeric inputs.
- Vignette on/off + angle/intensity.
- Crossfade duration slider 1.5–5.0 s, transition type select.
- Minimum clip length slider (default 14 s), max clip length (default 45 s).
- Slow-motion factor (1.0–2.0).
- "Mirror on repeat" toggle, "Seed" input with a "Reshuffle" button.
- **Live frame preview:** on slider change (debounce 300 ms, abort previous request with `AbortController`) call `POST …/preview/frame` and show the returned JPEG side-by-side with the original frame. Use a selectable sample clip.
- **"Generate 30-second preview"** button → job → plays in `<video controls>`.
- Persist settings via `PUT …/settings` (debounced autosave) and a "Reset to preset" button.

### 3.4 Build panel
- Shows audio status: detected `master_final` duration (from `StateManagerService`/project API) or "Audio not ready yet".
- Primary button logic:
  - Audio ready → **"Build final video"** (`POST /build`).
  - Audio not ready → **"Build video cycle only"** (renders the master cycle; mux later) and the final button becomes available automatically when audio appears (`POST /mux`).
- Shows plan estimate before building: number of clips used, cycle length, estimated disk usage, rough ETA (based on normalized/cached ratio).
- `JobProgress`: stage list (Normalizing → Planning → Rendering chunks → Stitching → Muxing), overall progress bar, current message, elapsed time, **Cancel** button. Handles `failed` with expandable error details (stderr tail) and "Retry" (idempotent stages make this cheap).
- On success: `OutputPlayer` (HTTP Range streaming), download button, file size/duration.
- All long operations must survive page reload: on mount, query for an active job and resubscribe.

### 3.5 UX/quality requirements
- Accessible (keyboard operable sliders, `aria-live` for job status).
- No blocking spinners for uploads; the user can adjust style while clips upload.
- Optimistic UI for enable/disable; roll back on error.
- Empty state with short instructions ("Drop 5 s – 60 s stock clips here").
- i18n: reuse the project's mechanism (the existing UI may be Russian) — keep strings in the i18n resources, not hard-coded.

### 3.6 Frontend tests
- Component tests for dropzone (filtering), upload queue (concurrency limit, retry), settings panel (debounce + abort), job hook (SSE reconnection and polling fallback).
- One E2E happy path (Playwright/Cypress if already used): upload 3 tiny clips → adjust brightness → preview frame → build cycle → player shows result.

---

## 4. Integration with the existing audio pipeline
- Expose `getFinalAudioInfo(projectId)` from the existing audio layer (path + duration via ffprobe). The video module depends on this interface only, not on TTS internals.
- When the audio pipeline finishes, emit an event (or update project state) so the frontend can enable the final mux button; optionally auto-start mux if a master cycle already exists and the user enabled "auto-mux".
- If the audio is regenerated with a different duration, the master cycle remains valid (loop mode) → only Stage 5 reruns.

---

## 5. Implementation order (suggested PR slicing)
1. **PR 1 – Foundations:** module skeleton, types, storage layout, config, `FfmpegService` extensions (progress parsing, cancellation), ffprobe inspection, upload endpoint + thumbnails + list/delete.
2. **PR 2 – Normalizer + planner:** Stage 1 and Stage 2 with unit tests; frame preview endpoint.
3. **PR 3 – Chunk renderer + stitcher + loop closing:** Stage 3–4 with integration tests on synthetic clips; seam validation.
4. **PR 4 – Mux + job system:** Stage 5, queue, SSE, cancel, restart recovery, 30 s preview.
5. **PR 5 – Frontend library + settings:** dropzone, upload queue, cards, settings with live frame preview.
6. **PR 6 – Frontend build/job UI + audio integration:** build panel, progress, player, auto-mux, E2E test.
7. **PR 7 – Hardening:** disk checks, cache cleanup, performance tuning, docs.

---

## 6. Acceptance criteria
- 100 mixed clips (5–60 s, fps 24/25/29.97/30/60, mixed resolutions/aspect ratios) can be uploaded in one session; invalid files are reported individually.
- Build of a 4.5 h project completes with peak ffmpeg RAM < ~2 GB (chunk size 10) and **without** encoding 4.5 h of unique video: final mux of a 45-minute cycle into a 4.5 h file takes under ~2 minutes (stream copy).
- No visible hard cuts at: clip boundaries, chunk boundaries, and the loop seam (verified by the seam test and a manual check).
- No A/V drift over 4.5 h (final duration == audio duration ± 1 frame; checked by ffprobe).
- Changing only crossfade/shuffle/seed does not re-run normalization; changing style re-normalizes only what is necessary; re-running a finished build is a no-op.
- Cancel works at any stage and leaves no partial files that look valid.
- Style sliders update the frame preview in < 1.5 s on a typical machine.
- Everything configurable via `VideoStyleConfig` with server-side validation; no user input reaches ffmpeg as raw filter text.

---

## 7. Open questions the agent must resolve by reading the code (and note answers in the PR)
1. How are projects/jobs identified and persisted today (`StateManagerService` API)?
2. Is there already a queue (BullMQ/Redis) and a push channel (SSE/WebSocket)?
3. Where does the final audio live and in which format (`.wav` vs `.flac`), and is its duration already stored?
4. Does `FfmpegService` already support progress parsing/cancellation?
5. Which UI kit / state library / data-fetching library does the frontend use?
6. Is there an existing max upload size / reverse proxy (nginx) limit that must be raised for large video uploads (`client_max_body_size`, request timeouts)?
7. Target hardware (CPU cores, RAM, GPU/NVENC availability) — if NVENC is available, add an optional `h264_nvenc` path **only** for Stage 1/3, keeping GOP/keyframe flags equivalent and re-validating stream-copy compatibility.
