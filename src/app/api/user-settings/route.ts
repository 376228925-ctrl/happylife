import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getAppState,
  updateUserMode,
  updateUserName,
  updateUserSettings,
} from "@/lib/db";
import type { CompanionAvatar, ThemeMode } from "@/types/app";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const { mode, name, remindersEnabled, reminderTime, dataSynced, voiceCompanionEnabled, voiceTone, companionAvatar } =
    (await request.json()) as {
    mode?: ThemeMode;
    name?: string;
    remindersEnabled?: boolean;
    reminderTime?: string;
    dataSynced?: boolean;
    voiceCompanionEnabled?: boolean;
    voiceTone?: "youth_girl" | "soft_girl" | "warm_neutral";
    companionAvatar?: CompanionAvatar;
  };

  const supportedModes: ThemeMode[] = ["night", "sunrise", "blossom"];
  if (mode !== undefined && !supportedModes.includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const supportedAvatars: CompanionAvatar[] = ["star", "moon", "flower"];
  if (companionAvatar !== undefined && !supportedAvatars.includes(companionAvatar)) {
    return NextResponse.json({ error: "Invalid companion avatar" }, { status: 400 });
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
    companionAvatar,
  });

  return NextResponse.json({ state: getAppState() });
}
