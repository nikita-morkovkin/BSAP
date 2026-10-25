# Kokoro TTS worker

The `tts-queue` worker streams Kokoro WAV responses to the chunk paths persisted
in project state. Voice blending and speed come from `profile.ttsVoice` and
`profile.ttsSpeed` (for example, `bm_george*0.65+bm_lewis*0.35` and `0.85`).

Configuration:

- `KOKORO_TTS_URL`: Kokoro base URL, without `/v1/audio/speech`.
  `KOKORO_TTS_URL` remains supported as a fallback.
- `KOKORO_TIMEOUT_MS`: request/stream timeout, default `300000`.
- `FFPROBE_PATH`: ffprobe executable, default `ffprobe`.
- `PROJECTS_DIR`: managed by the existing state module.

Completed chunks are skipped only after ffprobe validation. Durations must exceed
150 ms and are rounded to integer milliseconds to match the state schema.
Failed synthesis artifacts are removed; completed audio survives a failed queue
handoff so retries do not repeat inference.

Each ready chapter is handed off independently as `assemble-chapter` with
`{ projectId, chapterNumber }` on `audio-mastering`. Project status becomes
`MASTERING` once all chapters' chunks are completed and present. Chapter TTS
completion remains the responsibility of the chapter assembly consumer (task 006).
Retained deterministic job IDs deduplicate pending assembly jobs.

`concurrency: 1` serializes inference within this backend worker. Deploy only one
TTS worker/backend replica per GPU; this setting is not a distributed GPU lock.

## Verification

The default backend test suite skips the integration suite because it requires
Redis and ffprobe. To run it locally with both installed, set
`BSAP_TTS_INTEGRATION=1` and run `npm test -- --runInBand tts.integration.spec.ts`
from the backend directory. Redis defaults to `127.0.0.1:6379`; override with
`TEST_REDIS_HOST` and `TEST_REDIS_PORT`.

Alternatively, from the repository root with Compose Redis running:

```text
docker build --target tts-test -t bsap-tts-test backend
docker run --rm --network bsap_bsap-network bsap-tts-test
```

Adjust the network name if `COMPOSE_PROJECT_NAME` is not `bsap`. Tests use a unique
BullMQ key prefix, temporary project directories, and a mock streaming HTTP server;
they do not call Kokoro or modify existing projects/queues.
