# FFmpeg audio engine

The `audio-mastering` BullMQ worker processes `assemble-chapter` and `master-project`
jobs serially. The last assembled chapter enqueues a deduplicated mastering job.
Failed jobs retain their diagnostics and retry with exponential backoff.

## Configuration

- `FFMPEG_PATH` / `FFPROBE_PATH`: executable paths, defaulting to `ffmpeg` / `ffprobe`.
- `AMBIENT_DIR`: directory of ambient WAV files (alphabetical playback order),
  defaulting to the repository's `assets/ambient` directory.
- `PROJECTS_DIR`: existing project storage setting.

Mastering uses the project's `profile.masteringConfig`; defaults match task 006.
Original speech chunks remain untouched. Faded 24 kHz mono PCM copies are stored
in `chunks/normalized`; silence is cached in `chunks/silence`. Media is rendered
to unique temporary files, probed, then renamed. WAV outputs enable RF64 when
necessary for multi-hour audio. Intermediate files are retained for inspection.

Ambient sources are slowed, normalized to stereo, and crossfaded. Short sources
are repeated to support the full crossfade interval. An additional end-to-start
crossfade rotates the resulting cycle so repeated playback has a blended seam.
Supply naturally loopable sources to avoid discontinuities within repeated short
source tracks. A zero crossfade setting explicitly disables seamless blending.

Metadata offsets include every chunk's trailing pause. YouTube timestamps use
whole seconds. The requested six-column marker CSV uses **30 fps non-drop-frame**
timecodes, quoted CSV fields, and chapter in/out ranges. Select matching timeline
settings and the editor's appropriate marker CSV importer/conversion workflow;
native marker import formats differ between NLE versions.

## Verification

With Redis and FFmpeg installed, run from the backend directory:

```sh
BSAP_AUDIO_INTEGRATION=1 TEST_REDIS_HOST=127.0.0.1 npm test -- --runInBand audio.integration.spec.ts
```

The opt-in integration suite uses an isolated Redis prefix and temporary project
storage. It synthesizes two chapters of three chunks and two short ambient WAVs,
then checks real queue handoff, output codecs/durations, silence reuse, metadata,
CSV escaping, and persisted failure state. It cleans up its own artifacts.
