## Key Architectural Decisions & Rationale

### 1. Two-Tier LLM Routing & Reasoning Control (Cost Optimization)
Long-form documentaries require 13,000–15,000+ words per episode. Using a frontier reasoning model for the entire text would be prohibitively expensive.
* **Decision:** Split script generation into two distinct roles configured via the UI:
  1. **Architect Model** (e.g., *Sonnet 5.5* or *ChatGPT 6.1 Sol* with `reasoningEffort: high`): Executed once per project to design a factually accurate, non-repetitive 15–20 chapter outline.
  2. **Writer Model** (e.g., *ChatGPT 6 Luna* or *GLM 5.3 Flash* with `reasoningEffort` none or low): Executed iteratively per chapter with thinking tokens disabled to produce pure literary narration at minimal cost, passing the tail of chapter `N-1` to ensure smooth transitions.

### 2. Lightweight Local TTS with Voice Blending (6 GB VRAM Constraint)
Heavy zero-shot TTS models (like Fish Speech or XTTS) consume 4.5–5.5 GB VRAM, risking CUDA Out-Of-Memory crashes and thermal throttling on a laptop NVIDIA RTX 3050 (6 GB VRAM) during multi-hour runs.
* **Decision:** Use **Kokoro-82M GPU** with `concurrency: 1` in BullMQ. It uses <1.5 GB VRAM, synthesizes 2 hours of audio in ~12 minutes, never hallucinates on long runs, and supports **Voice Blending** (mixing mature British male presets at `0.85x` speed) to achieve a deep, wise elderly narrator persona.

### 3. Deterministic Text Normalization Before TTS
LLMs occasionally ignore prompt rules and output raw digits (`1970s`, `-45.2°C`, `15%`) or Markdown (`**`), causing TTS models to mispronounce symbols or glitch.
* **Decision:** Place a deterministic Regex + `number-to-words` sanitizer and `sentence-splitter` between the LLM output and the TTS worker. Every chunk is guaranteed to contain pure English words and stay under 200 characters.

### 4. Disk-Persisted State Machine (`state.json`) for Crash Recovery
Generating 20 chapters and 600+ audio chunks takes time. A network drop or container restart at 90% must not force a full restart.
* **Decision:** Every project stores an atomic `state.json` on disk. Workers verify both `state.json` status and physical file existence before executing any LLM call or TTS synthesis, allowing instant resume from the exact failed chunk.

### 5. FFmpeg Concat Demuxer + Automated `lavfi` Studio Mastering
Connecting 100+ audio chunks and pauses via FFmpeg `acrossfade` filtergraphs overflows RAM and CLI argument limits. Furthermore, manual audio editing in Audacity slows down production.
* **Decision:** Apply micro-fades (`afade`) to individual chunks, generate cached `.wav` silence files for pauses, and stitch chapters instantaneously via the zero-overhead **FFmpeg Concat Demuxer**. The final voice track is automatically processed through a `lavfi` mastering chain (Highpass, Warmth EQ boost at 135Hz, De-Esser, Lowpass at 6.5kHz, Compressor, and `-18 LUFS` sleep loudness normalization) and mixed with a slow-stretched, crossfaded ambient music bed.