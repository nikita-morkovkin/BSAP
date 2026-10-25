import { create } from 'zustand';
import type { AudioPlayerState } from '@/types/store.types';

export const useAudioPlayerStore = create<AudioPlayerState>((set) => ({
  activeChunkId: null,
  audioUrl: null,
  isPlaying: false,
  volume: 0.8,
  playChunk: (activeChunkId, audioUrl) => set({ activeChunkId, audioUrl, isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  reset: () => set({ activeChunkId: null, audioUrl: null, isPlaying: false }),
}));