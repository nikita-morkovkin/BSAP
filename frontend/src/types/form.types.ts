import type { ChangeEvent } from 'react';
import type { Profile } from './project.types';

export type ProfileField = keyof Pick<Profile, 'architectModel' | 'writerModel'
  | 'architectSystemPrompt' | 'writerSystemPrompt' | 'ttsVoice' | 'maxChunkChars'>;
export type ProfileInputEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;