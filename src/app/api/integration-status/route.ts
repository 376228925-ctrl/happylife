import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const deepSeekVisionModel = process.env.DEEPSEEK_VISION_MODEL?.trim();
  const openAiVisionModel = process.env.OPENAI_API_KEY?.trim()
    ? process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4.1-mini"
    : "";
  const hasDoubaoTts = Boolean(
    process.env.VOLCENGINE_TTS_APP_ID?.trim() && process.env.VOLCENGINE_TTS_TOKEN?.trim(),
  );

  return NextResponse.json({
    capabilities: [
      {
        id: "chat",
        label: "AI 陪伴对话",
        status: hasDeepSeek ? "ready" : "pending",
        detail: hasDeepSeek
          ? `DeepSeek · ${process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash"}`
          : "等待配置 DeepSeek API",
      },
      {
        id: "vision",
        label: "拍照识别热量",
        status: deepSeekVisionModel || openAiVisionModel ? "ready" : "limited",
        detail: deepSeekVisionModel
          ? `DeepSeek · ${deepSeekVisionModel}`
          : openAiVisionModel
            ? `OpenAI · ${openAiVisionModel}`
            : "当前使用基础估算，等待视觉模型",
      },
      {
        id: "voice",
        label: "语音陪伴",
        status: hasDoubaoTts ? "ready" : "limited",
        detail: hasDoubaoTts
          ? `豆包语音 · ${process.env.VOLCENGINE_TTS_VOICE_TYPE?.trim() || "BV113_streaming"}`
          : "当前使用设备系统音，配置豆包语音凭证后自动升级",
      },
      {
        id: "storage",
        label: "生活数据保存",
        status: "ready",
        detail: "SQLite 本地数据库已启用",
      },
      {
        id: "cloud",
        label: "云同步与多端恢复",
        status: "pending",
        detail: "等待账号体系和云数据库",
      },
    ],
  });
}
