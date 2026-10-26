# Backend Plan: Voice, Music, and Mixed Audio Exports

## Goal

Make music optional instead of a prerequisite for mastering. Every completed project must provide a downloadable voice-only master and existing metadata exports. When the ambient library has enabled tracks, also render a music-only stem and a mixed voice-plus-music master. Provide a safe API for the frontend to manage the shared ambient library.

## Current backend behavior

- `FfmpegService.buildAmbientBed()` discovers all `.wav` files in `AMBIENT_DIR` (or `assets/ambient`), sorts by filename, slows/crossfades them, and writes `output/ambient_cycle.wav`.
- `masterProject()` currently always calls that method and fails if there are no tracks. It concatenates narration into `output/voice_raw_full.wav`, then writes only mixed `master_final.wav` and `master_final.flac` as downloadable final audio.
- `State.outputFiles`, the media artifact schema, and `MediaService` expose only `wav`, `flac`, `timestamps`, and `markers`.
- There is no endpoint for listing, uploading, ordering, enabling, or deleting ambient files. Docker already mounts the shared `assets` directory into the backend.

## Planned behavior and contracts

### 1. Mastering and artifact lifecycle

1. Continue to concatenate chapter masters into `output/voice_raw_full.wav`.
2. Apply the configured voice mastering chain and render a finalized voice-only stem. Export WAV and FLAC variants (suggested artifact keys `voiceWav` and `voiceFlac`). Apply voice padding and end fade consistently; do not route this stem through the music mix.
3. Resolve the active ambient playlist from the managed library. If it is non-empty:
   - Build the processed seamless ambient cycle using the existing speed and crossfade settings.
   - Loop/trim it to match the finalized voice stem's exact duration, including padding and final fade, and export music-only WAV/FLAC stem artifacts (`musicWav`, `musicFlac`).
   - Mix that stem with the voice stem at the configured ambient gain and export the existing mixed master artifacts (`wav`, `flac`).
4. If the playlist is empty, do not fail. Complete mastering with the voice-only exports and metadata; leave music and mixed output artifact keys absent. The UI must show mixed downloads as unavailable rather than presenting voice-only audio as a mix.
5. Keep chapter timestamps and timeline markers based on narration/chapter durations, not music duration.
6. Record every available output path in `state.json`; clear stale music/mixed paths at the start of a remaster so removed or disabled tracks cannot leave stale downloads advertised.
7. Preserve streaming downloads through `MediaService` and `StreamableFile`; do not buffer multi-hour audio in memory.

The voice, music, and mixed deliverables should be aligned and have identical final durations whenever music is enabled. Keep `output/ambient_cycle.wav` as an intermediate if useful, but do not treat it as the episode-length music stem.

### 2. Ambient library management API

Add a shared ambient library service/controller, backed by `AMBIENT_DIR` and a small atomic manifest for stable track IDs, display names, enabled state, and explicit playlist order. Keep uploaded source files as WAV, retaining current compatibility. Suggested routes:

- `GET /api/ambient`: list track IDs, display names, enabled state, and order.
- `POST /api/ambient`: multipart WAV upload; validate file size, extension, and that FFprobe can read an audio stream; assign a safe unique stored filename and add it to the manifest atomically.
- `PATCH /api/ambient/:trackId`: update enabled state and/or display name if supported.
- `PUT /api/ambient/order`: validate the complete set of known track IDs and persist the requested order atomically.
- `DELETE /api/ambient/:trackId`: remove the track and its manifest entry, returning clear not-found/validation errors.

The worker must consume only enabled tracks and honor manifest order. Resolve all file paths beneath the configured ambient root; never trust a client-provided path. Avoid partial uploads and partially written manifests. Define bounded upload size and useful API errors. If an asset changes while a long mastering job is running, use a stable snapshot of the selected track paths/files for that job or otherwise ensure deterministic completion.

### 3. State, validation, and media types

- Extend `stateSchema.outputFiles`, its inferred types, the media artifact Zod enum/type, and `MediaService` filename/MIME mappings for voice-only and music-only outputs.
- Preserve existing `wav` and `flac` keys as the mixed master for backward compatibility. Document that they are available only when ambient music was included.
- Keep optional output keys omitted when the corresponding files were not generated.
- Validate route parameters, upload type/size, manifest contents, and safe generated filenames.

## Backend implementation sequence

1. Add/migrate state and media-artifact contracts for voice/music stems without changing existing mixed artifact aliases.
2. Refactor mastering into clear render steps: mastered voice stem, optional duration-matched music stem, optional mixed master, metadata, then completed state.
3. Add ambient manifest/service/controller operations, file validation, atomic writes, and library API tests.
4. Extend media downloads with streaming MIME/disposition mappings for all stems.
5. Update audio integration tests for both empty-library and populated-library cases, including duration alignment, artifact availability, retry/resume, and metadata invariance.
6. Run backend build and relevant unit/API/integration tests; validate FFmpeg outputs with FFprobe.

## Acceptance criteria

- A project with no ambient tracks completes successfully and has voice WAV/FLAC plus timestamps/markers; it has no music or mixed artifacts.
- A project with enabled tracks produces voice-only, full-length music-only, and mixed WAV/FLAC outputs with matching durations, plus existing metadata.
- Existing `wav`/`flac` downloads remain the mixed master when available.
- Ambient upload/list/order/enable/delete operations are validated, safe, and persistent across backend restarts.
- All long media downloads stream from disk, and artifact state accurately represents generated files only.