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
