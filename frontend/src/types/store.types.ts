export type NavigationTab = 'create' | 'monitor' | 'downloads' | 'music';
export type Theme = 'light' | 'dark';

export type AudioPlayerState = {
  activeChunkId: string | null;
  audioUrl: string | null;
  isPlaying: boolean;
  volume: number;
  playChunk: (chunkId: string, url: string) => void;
  pause: () => void;
  setVolume: (volume: number) => void;
  reset: () => void;
};

export type UiState = {
  activeTab: NavigationTab;
  expandedChapters: string[];
  selectedProjectId: string | null;
  theme: Theme;
  setActiveTab: (tab: NavigationTab) => void;
  selectProject: (id: string) => void;
  setExpandedChapters: (chapters: string[]) => void;
  toggleTheme: () => void;
};