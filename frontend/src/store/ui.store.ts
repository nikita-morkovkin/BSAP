import type { Theme, UiState } from "@/types/store.types";
import { create } from "zustand";
import { useAudioPlayerStore } from "./audioPlayer.store";

const getInitialTheme = (): Theme => {
  try {
    const storedTheme = localStorage.getItem("bsap-theme");

    if (storedTheme === "dark" || storedTheme === "light") {
      document.documentElement.classList.toggle("dark", storedTheme === "dark");

      return storedTheme;
    }
  } catch {
    document.documentElement.classList.remove("dark");
  }

  return "light";
};

export const useUiStore = create<UiState>((set) => ({
  activeTab: "create",
  expandedChapters: [],
  selectedProjectId: null,
  theme: getInitialTheme(),
  setActiveTab: (activeTab) => set({ activeTab }),
  selectProject: (selectedProjectId) => {
    useAudioPlayerStore.getState().reset();
    set({ selectedProjectId, activeTab: "monitor", expandedChapters: [] });
  },
  setExpandedChapters: (expandedChapters) => set({ expandedChapters }),
  toggleTheme: () => {
    set((state) => {
      const theme = state.theme === "dark" ? "light" : "dark";

      document.documentElement.classList.toggle("dark", theme === "dark");

      try {
        localStorage.setItem("bsap-theme", theme);
      } catch {
        //
      }

      return { theme };
    });
  },
}));
