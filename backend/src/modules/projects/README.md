# Projects REST API

All routes use `/api/projects`. CORS is enabled and exposes media response headers.

- `GET /` returns project summaries, newest first.
- `GET /defaults` returns a complete profile, including the default system prompt
  file contents and mastering defaults. Model IDs can be configured with
  `DEFAULT_ARCHITECT_MODEL` and `DEFAULT_WRITER_MODEL`.
- `POST /` accepts `{ "topic": "...", "profile": <defaults with UI edits> }`,
  validates the profile strictly, persists the project, and queues outline/script
  generation. Returns the initial state with HTTP 201.
- `GET /:id` returns `{ "state": ..., "outline": ... }`. The outline is `null`
  until its file exists.
- `DELETE /:id` removes the project directory and its queued/completed/failed
  pipeline jobs, returning HTTP 204. Active work returns HTTP 409 without deleting
  files. Queue dispatch is briefly paused during deletion and restored afterward.
  Unknown projects return HTTP 404; malformed IDs return HTTP 400.
- `POST /:id/resume` returns HTTP 202 and the current state. It recovers the
  earliest incomplete stage, including completed artifacts that were deleted.
  Existing queued/active jobs are not duplicated; failed jobs are retried.
- `POST /:id/chapters/:chapterNumber/chunks/:chunkId/regenerate` accepts an object
  with optional `text`, `ttsVoice`, `ttsSpeed`, and `pauseAfterMs` fields. Returns
  HTTP 202. The pipeline must be idle with all chapters assembled; concurrent
  regeneration returns HTTP 409. Overrides are persisted on the selected chunk,
  not the project profile. That chunk is synthesized, then its chapter is
  assembled and the project is mastered by the existing worker handoffs. If a
  queue handoff fails, use resume; persisted overrides survive retries/restarts.

## Provider settings

- `GET /api/settings/models` fetches the Polza catalog through `POLZA_API_URL`,
  with server-side authorization. Only chat models are returned, including their
  supported parameters and reasoning efforts/defaults/mandatory flag.
- `GET /api/settings/voices` fetches `/v1/audio/voices` from `KOKORO_TTS_URL`.
  Both legacy string lists and current `{ id, name }` entries are supported.
- The UI searches model names and IDs by keyword and limits effort selection to
  each model's catalog values. Catalog failures display retry controls.
- Voice selection uses one catalog ID, with narration speed stored separately as
  `ttsSpeed`. Legacy weighted formulas load as their first voice (for example,
  `bm_george*0.65+bm_lewis*0.35` becomes `bm_george`); blending is not preserved.
  The TTS adapter verifies IDs against the live voice catalog before synthesis.

## Disk-backed media

- `GET /:id/media/chunks/:chunkId`: WAV playback, `Accept-Ranges: bytes`;
  single closed/open/suffix ranges return 206. Invalid, unsatisfiable, and
  multipart ranges return 416 with `Content-Range: bytes */<size>`.
- `GET /:id/media/chapters/:chapterNumber/download`: chapter attachment named
  `ch_XX.wav`.
- `GET /:id/media/download/:artifact`: `wav`, `flac`, `timestamps`, or `markers`.
  Files are resolved from persisted state, verified to be inside the project
  directory (including symlink resolution), and streamed with `StreamableFile`
  and `createReadStream`, never read into memory in full. Unavailable files
  return 404; invalid route/body values return 400.

This is a local-first API without authentication. Bind/proxy it appropriately;
do not expose it directly to an untrusted network.

## Verification

Run `npm test -- --runInBand` and `npm run build` from the backend directory.
The REST tests use a real Nest HTTP application, temporary disk artifacts, and
mocked queue boundaries (no Redis, LLM provider, or GPU required).
The existing opt-in audio/TTS integration suites require Redis and FFmpeg/
ffprobe; enable them using their documented environment flags.
