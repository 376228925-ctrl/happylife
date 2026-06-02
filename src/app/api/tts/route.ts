import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DoubaoTtsResponse = {
  code?: number;
  message?: string;
  data?: string;
};

export async function POST(request: Request) {
  const { text } = (await request.json().catch(() => ({}))) as { text?: string };
  const content = text?.replace(/\s+/g, " ").trim();
  if (!content) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const appId = process.env.VOLCENGINE_TTS_APP_ID?.trim();
  const token = process.env.VOLCENGINE_TTS_TOKEN?.trim();
  if (!appId || !token) {
    return NextResponse.json(
      { error: "CLOUD_TTS_NOT_CONFIGURED", message: "豆包语音尚未配置，已回退到设备系统音。" },
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
        voice_type: process.env.VOLCENGINE_TTS_VOICE_TYPE?.trim() || "BV113_streaming",
        encoding: "mp3",
        rate: 24000,
        speed_ratio: 0.96,
        volume_ratio: 1,
        pitch_ratio: 1,
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
