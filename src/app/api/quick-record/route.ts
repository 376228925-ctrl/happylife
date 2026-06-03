import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addMemory, applyQuickRecordImpact, classifyQuickRecord, getAppState } from "@/lib/db";

export const runtime = "nodejs";

const categoryToType: Record<string, string> = {
  mood: "emotion",
  diet: "diet",
  sleep: "sleep",
  water: "water",
  exercise: "exercise",
  moment: "small_happiness",
  talk_to_xiaoyue: "emotion",
};

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const { text, category } = (await request.json()) as {
    text?: string;
    category?: string;
  };
  const content = text?.trim();

  if (!content) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const type = category && categoryToType[category] ? categoryToType[category] : classifyQuickRecord(content);
  const titleMap: Record<string, string> = {
    diet: "小悦已记录你的饮食",
    sleep: "小悦已记录你的睡眠状态",
    water: "小悦已记录你的喝水提醒",
    exercise: "小悦已记录你的运动",
    small_happiness: "小悦发现了一份小确幸",
    emotion: "小悦已收好你的心情",
  };

  const item = addMemory({
    type,
    title: titleMap[type] ?? "小悦已帮你记录",
    content,
    mood: type === "small_happiness" ? "开心" : "被看见",
    time: "刚刚",
    tags: [type === "small_happiness" ? "小确幸" : "记录", "小悦整理"],
  });
  const impact = applyQuickRecordImpact(type, content);

  return NextResponse.json({ item, impact, state: getAppState() });
}
