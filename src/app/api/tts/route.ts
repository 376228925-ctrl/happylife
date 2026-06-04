import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

type DoubaoTtsResponse = {
  code?: number;
  message?: string;
  data?: string;
};

const voiceTypeByTone = {
  youth_girl: {
    env: "VOLCENGINE_TTS_VOICE_TYPE_YOUTH_GIRL",
    fallback: "BV113_streaming",
    speed: 1.02,
    pitch: 1.08,
  },
  soft_girl: {
    env: "VOLCENGINE_TTS_VOICE_TYPE_SOFT_GIRL",
    fallback: "BV001_streaming",
    speed: 0.94,
    pitch: 1.02,
  },
  warm_neutral: {
    env: "VOLCENGINE_TTS_VOICE_TYPE_WARM_NEUTRAL",
    fallback: "BV002_streaming",
    speed: 0.96,
    pitch: 0.98,
  },
} as const;

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const { text, tone } = (await request.json().catch(() => ({}))) as {
    text?: string;
    tone?: keyof typeof voiceTypeByTone;
  };
  const content = text?.replace(/\s+/g, " ").trim();
  if (!content) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const voiceConfig = voiceTypeByTone[tone || "youth_girl"] || voiceTypeByTone.youth_girl;
  const appId = process.env.VOLCENGINE_TTS_APP_ID?.trim();
  const token = process.env.VOLCENGINE_TTS_TOKEN?.trim();
  if (!appId || !token) {
    return NextResponse.json(
      { error: "CLOUD_TTS_NOT_CONFIGURED", message: "豆包语音尚未配置，前端会保持静音并提示用户。" },
      { status: 503 },
    );
  }

  const response = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer;${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app: {
        appid: appId,
        token,
        cluster: process.env.VOLCENGINE_TTS_CLUSTER?.trim() || "volcano_tts",
      },
      user: { uid: "happylife-companion" },
      audio: {
        voice_type:
          process.env[voiceConfig.env]?.trim() ||
          process.env.VOLCENGINE_TTS_VOICE_TYPE?.trim() ||
          voiceConfig.fallback,
        encoding: "mp3",
        rate: 24000,
        speed_ratio: voiceConfig.speed,
        volume_ratio: 1,
        pitch_ratio: voiceConfig.pitch,
      },
      request: {
        reqid: randomUUID(),
        text: content.slice(0, 900),
        text_type: "plain",
        operation: "query",
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as DoubaoTtsResponse;
  if (!response.ok || payload.code !== 3000 || !payload.data) {
    return NextResponse.json(
      { error: "CLOUD_TTS_FAILED", message: payload.message || "豆包语音合成暂时不可用。" },
      { status: 502 },
    );
  }

  return new NextResponse(Buffer.from(payload.data, "base64"), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "audio/mpeg",
      "X-TTS-Provider": "Doubao Voice",
    },
  });
}
