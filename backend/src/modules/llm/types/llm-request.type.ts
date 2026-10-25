import type { ReasoningEffort } from './reasoning-effort.type';

export type LlmRequest = {
  model: string;
  system: string;
  prompt: string;
  reasoningEffort: ReasoningEffort;
  temperature: number;
  abortSignal?: AbortSignal;
};
