# Music library and project soundtracks

## MP3 support

Upload and replacement accept both `.wav` and `.mp3` (case-insensitive). The server verifies the actual format against the filename extension with FFprobe and fully decodes the source with FFmpeg before publication. Existing size/duration limits apply to both formats. Sources and immutable project snapshots preserve their original encoding and use generated `.wav` or `.mp3` paths; mastering can mix both formats without a separate conversion step. Replacing a WAV with an MP3, or vice versa, never changes existing project snapshots. Initial catalog import includes both formats; existing catalogs are not rescanned, so add new files through the library upload control.

## Configuration and storage

`AMBIENT_DIR` defaults to repository `assets/ambient`, including when launched from `backend`. Docker uses `/app/assets/ambient` on the existing read/write mount. Native Windows paths work through Node path resolution. Set `FFPROBE_PATH` and `FFMPEG_PATH` to installed tools.

`MUSIC_MAX_UPLOAD_BYTES=536870912` permits 512 MiB; `MUSIC_MAX_DURATION_SECONDS=14400` permits four hours. Nest Express/Multer streams one multipart `file` to `.uploads`, with bounded file/field sizes and counts. The server checks WAV headers, FFprobe format/streams/duration, and a complete FFmpeg decode before publication. Temporary files are removed on rejection/completion, and interrupted uploads on restart.

Run **one backend process per storage root**, matching StateManagerService's process-local locks. Clustered replicas sharing storage are unsupported. External processes must not mutate storage while in use. Source/snapshot path components are checked for symlinks and root containment. Browser filenames never determine disk paths.

`catalog.json` is strictly validated and stores UUID identities, immutable UUID versions, display/original names, relative source paths, duration, size, SHA-256 and timestamps. Public library metadata never includes storage paths. The first initialization imports root-level WAVs once, in the old filename order, persists stable IDs and reports invalid files individually. Legacy originals remain untouched and are never rescanned after catalog creation. Missing/corrupt sources remain visible as unavailable.

## Publication and recovery

Catalog mutations and source snapshot copies share one serialized operation chain. Sources are copied to temporary files and atomically renamed, then the catalog is atomically replaced. Until catalog publication, the old catalog is authoritative. Startup removes unreferenced source versions, source/catalog temporary files and interrupted uploads. Invalid catalog data fails clearly rather than being overwritten.

Each project owns `music/<batch UUID>/<file UUID>.wav` copies. Optional `state.music` records ordered unique selected IDs, snapshots with source identity/version/checksum, and an optimistic selection revision. Project state publication is the commit point. Failed preparation removes partial batches. Unreachable batches are reclaimed on the next selection save or project deletion. Library replacement/deletion and source copying are serialized, so no dangling library dependency can be committed.

Missing legacy selections resolve once before mastering, in the old filename order. Explicit `[]` means narration-only. Reading a completed legacy project does not migrate it or invalidate exports. Saved snapshots remain independent of library changes and are checksum-verified before rendering; missing/corrupt copies fail rather than silently substituting tracks.

## API

- `GET /api/music`: `{ tracks, importErrors }`, with availability.
- `POST /api/music`: multipart `file`, optional `displayName`.
- `PATCH /api/music/:trackId`: `{ displayName }`.
- `PUT /api/music/:trackId/file`: multipart `file`, creates a version while preserving ID.
- `DELETE /api/music/:trackId`: deletes only library metadata/source, never project copies.
- `POST /api/projects`: optional ordered `selectedTrackIds`, including `[]`; omission selects valid current sources. Snapshots commit before work is queued. Failed selection creation removes the new project.
- `PUT /api/projects/:id/music`: `{ revision, selectedTrackIds, ambientVolumeDb? }`; volume is in dB and defaults to the saved value when omitted. An unchanged selection and volume is a no-op. A volume-only change preserves the immutable soundtrack snapshots and narration while invalidating the derived mix. Retained IDs keep saved versions, including deleted library tracks. To explicitly adopt a newer version, remove and save, then reselect and save.
- `GET /api/projects/:id/media/download/backgroundMusic`: streams the complete rendered background music bed (WAV), without narration, at the production duration. The saved soundtrack order, speed, volume, and fade settings are applied during mastering. The artifact is unavailable when no music is selected.
- `POST /api/projects/:id/remaster`: validates assembled narration and snapshots, queues the existing recoverable mastering job, and never regenerates scripts/TTS.

Status codes: 400 invalid metadata/IDs, 404 absent resources, 409 lifecycle/revision conflict, 413 size limit, 415 invalid/unsupported WAV. Selection/remaster operations briefly pause dispatch and inspect active/waiting/delayed/prioritized/dependency jobs across production queues. Active/queued work rejects edits. Mastering completion checks the captured selection revision before exposing output paths.

Selection or volume saves clear derived output references and remove ambient cycles, the rendered background music-only WAV, final WAV/FLAC, manifests and bundle files, while retaining the `narration` download reference, chapters/chunks, and assembled raw narration. Resume recognizes missing/stale mix revisions. Empty selections skip ambient generation/mixing and therefore have no background music-only download, but retain voice mastering, padding, fades, final formats and metadata exports. `GET /api/projects/:id/media/download/narration` streams the assembled voiceover WAV with pauses, before final mastering and without background music. The Downloads view offers one complete rendered background-music WAV, not individual soundtrack source files. `output/music_manifest.json` records reproducibility metadata for Task 012.

## UI and verification

Music Library offers upload, rename, replacement and confirmed deletion, with pending/errors per action. Create initializes selection once; catalog refetch never overwrites choices. Project details show saved versions and missing/replaced library entries, native inclusion checkboxes, select/clear all, counts, narration-only state, local drafts, an adjustable background music dB slider, revision-safe Save and explicit Rebuild mix. Downloads include the separate assembled voiceover WAV and a single full-length rendered background music-only WAV. Server state stays in TanStack Query, not Zustand.

Run backend Jest/build and frontend Node tests/lint/build. `backend/scripts/music-smoke.cjs` exercises real WAV validation, selected/narration-only mastering, restart, snapshot survival after replacement/deletion, limits and invalid/truncated sources using compiled backend code. It uses an isolated OS temporary directory and removes it afterward. Run where FFmpeg/FFprobe and backend dependencies are available. Browser upload, focus and keyboard interaction still require an actual browser check; source-contract Node tests do not substitute for that.

Implementation verification: backend Jest passed 111 tests (13 existing opt-in integration tests skipped); backend build and targeted music/audio ESLint passed. Frontend Node tests, lint and production build passed. Real FFmpeg/FFprobe smoke validation passed in an isolated temporary directory inside the running backend container, including selection ordering after restart and stale-revision publication rejection. Existing running application code and production project/library data were not replaced by this verification. Browser checks were not performed because no browser-control tooling was available. The frontend build retains a non-failing large-chunk warning.