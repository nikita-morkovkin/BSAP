## What is BSAP?

**Bedtime Science Audio Pipeline (BSAP)** is a local-first, fault-tolerant web application and automated media pipeline designed to produce long-form (1.5 to 4+ hours) soothing science audio documentaries in English for the "Sleepy Science" YouTube and podcast niche (channel: _Bedtime Science | Sleep & Relax_).

Given a single topic, BSAP orchestrates the entire production lifecycle:

1. Generates a structured, multi-chapter documentary outline and soothing narration scripts via LLMs.
2. Sanitizes text, converts all numerical values into spoken English words, extracts pause tags, and splits chapters into short syntactic chunks.
3. Synthesizes consistent, warm, elderly-narrator speech locally on a consumer GPU.
4. Stitches audio chunks with natural pauses, mixes in a seamless ambient background bed, and runs an automated broadcast-grade studio mastering chain.
5. Provides a React web interface to configure prompts/models, monitor real-time progress, preview or regenerate individual audio chunks, and download the final master audio, the assembled voiceover separately, the complete background music track without narration, YouTube timestamps, and video editor timeline markers.
6. Manages a reusable WAV music library with upload, rename, replacement, and deletion. Ordered per-project inclusion checkboxes create immutable local soundtrack copies; library edits never alter a saved soundtrack. Empty selections produce narration-only masters. The background music volume can be adjusted after creation and applied by rebuilding the mix from assembled narration, without regenerating scripts or TTS. Downloads include a full-duration rendered background music WAV without narration and a separate voiceover containing assembled narration and pauses without background music or final mastering.
