"use client";

import { create } from "zustand";
import type { Screen, ThemeMode } from "@/types/app";

type Tab = "home" | "companion" | "plus" | "memories" | "my";

type AppStore = {
  screen: Screen;
  previousScreen: Screen;
  activeTab: Tab;
  mode: ThemeMode;
  setScreen: (screen: Screen, tab?: Tab) => void;
  setMode: (mode: ThemeMode) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  screen: "home",
  previousScreen: "home",
  activeTab: "home",
  mode: "night",
  setScreen: (screen, tab) =>
    set((state) => ({ previousScreen: state.screen, screen, activeTab: tab ?? state.activeTab })),
  setMode: (mode) => set({ mode }),
}));
