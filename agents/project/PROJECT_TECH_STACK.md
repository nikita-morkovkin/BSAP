## Technology Stack

- **Backend Framework:** NestJS + TypeScript (Strict Mode) on Node.js LTS.
- **Frontend UI:** React (Vite + TypeScript), Tailwind CSS, and **shadcn/ui**, react-icons, axios, TanStack Query (React Query), Zustand
- **Queue & Background Processing:** BullMQ + Redis (Dockerized).
- **Validation & Typing:** **Zod** (`*.schema.ts` and inferred `*.type.ts`).
- **LLM Integration:** **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) routed through **Polza.AI Proxy** (`polza-api`), a cost-filtering OpenAI-compatible gateway.
- **Text Processing:** `sentence-splitter`, `number-to-words`, and deterministic Regex sanitizers.
- **Local TTS Engine:** **Kokoro-82M** (`kokoro-fastapi-gpu`) running in an isolated Docker container with NVIDIA GPU acceleration.
- **Audio Engine & Mastering:** **FFmpeg** (`lavfi` filtergraphs + Concat Demuxer) and **FFprobe**.
