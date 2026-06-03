import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getAppState,
  updateUserMode,
  updateUserName,
  updateUserSettings,
} from "@/lib/db";
import type { UserProfile } from "@/types/app";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const { mode, name, remindersEnabled, reminderTime, dataSynced, voiceCompanionEnabled, voiceTone } =
    (await request.json()) as {
    mode?: UserProfile["currentMode"];
    name?: string;
    remindersEnabled?: boolean;
    reminderTime?: string;
    dataSynced?: boolean;
    voiceCompanionEnabled?: boolean;
    voiceTone?: "youth_girl" | "soft_girl" | "warm_neutral";
  };

  if (mode !== undefined && mode !== "day" && mode !== "night") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  if (mode) {
    updateUserMode(mode);
  }

  if (typeof name === "string" && name.trim()) {
    updateUserName(name);
  }

  updateUserSettings({
    remindersEnabled,
    reminderTime,
    dataSynced,
    voiceCompanionEnabled,
    voiceTone,
  });

  return NextResponse.json({ state: getAppState() });
}
