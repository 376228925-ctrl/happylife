import OpenAI from "openai";
import { NextResponse } from "next/server";
import { addChatMessage, getAppState } from "@/lib/db";

export const runtime = "nodejs";

const systemPrompt = `
你是幸福人生 App 里的 AI 陪伴者“小悦”。
你的用户是高压年轻职场人。你不是客服，不是效率教练，而是一个懂得分寸、愿意安静坐在用户身边的长期陪伴者。
回复要温柔、克制、有呼吸感。先接住情绪，再用自己的话理解用户，最后只给一个低成本下一步。
语言允许带一点文学色彩和治愈感：可以偶尔使用夜灯、窗边、微风、热茶、月色等生活化意象，但每次最多一个，不要堆砌，不要油腻。
不要使用模板式句型，不要每次都说“听起来”“我们先”，不要像客服话术。用户开玩笑时，可以轻轻接住幽默。
不要自称心理医生，不做诊断，不夸张承诺。
回复控制在 60 到 150 个中文字符以内，适合手机聊天阅读。
`;

export async function POST(request: Request) {
  const { message } = (await request.json()) as { message?: string };
  const text = message?.trim();

  if (!text) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const baseURL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
  const hasRealKey = Boolean(apiKey && apiKey.startsWith("sk-") && apiKey.length > 20);
  if (!hasRealKey) {
    return NextResponse.json(
      {
        error: "AI_NOT_CONFIGURED",
        message: "请在环境变量中配置有效的 DEEPSEEK_API_KEY 后再使用 AI 陪伴对话。",
      },
      { status: 503 },
    );
  }

  addChatMessage("user", text);

  try {
    const client = new OpenAI({ apiKey, baseURL });
    const state = getAppState();
    const recent = state.chat.slice(-8).map((item) => ({
      role: item.role as "user" | "assistant",
      content: item.content,
    }));

    const response = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content: `今日状态：睡眠 ${state.today.sleepHours}h，心情 ${state.today.moodLabel}，压力 ${state.today.stress}%。请结合上下文陪伴用户。`,
        },
        ...recent,
      ],
    });

    const reply = response.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "AI_EMPTY_RESPONSE", message: "模型暂时没有返回内容，请再试一次。" },
        { status: 502 },
      );
    }

    const assistantMessage = addChatMessage("assistant", reply);
    return NextResponse.json({
      message: assistantMessage,
      reply,
      provider: "DeepSeek",
      model,
      state: getAppState(),
    });
  } catch (error) {
    console.error("DeepSeek chat failed", error);
    return NextResponse.json(
      { error: "AI_REQUEST_FAILED", message: "模型连接暂时失败，请稍后重试。" },
      { status: 502 },
    );
  }
}
