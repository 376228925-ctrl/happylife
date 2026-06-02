"use client";

import { create } from "zustand";
import type { Screen } from "@/types/app";

type Tab = "home" | "companion" | "plus" | "memories" | "my";

type AppStore = {
  screen: Screen;
  previousScreen: Screen;
  activeTab: Tab;
  mode: "day" | "night";
  setScreen: (screen: Screen, tab?: Tab) => void;
  setMode: (mode: "day" | "night") => void;
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
