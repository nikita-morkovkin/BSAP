export type CharacterClip = {
  id: string; originalName: string; durationSec: number; width: number; height: number; fps: number;
  role?: 'idle' | 'talk' | 'greeting_source'; hasAudio?: boolean;
};