import OpenAI from "openai";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAppState } from "@/lib/db";

export const runtime = "nodejs";

type VisionResult = {
  foodName: string;
  calories: number;
  confidence: number;
  mealType?: "早餐" | "午餐" | "晚餐" | "加餐";
  note?: string;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  vitamins: string;
  portion: string;
  provider: string;
  usedFallback?: boolean;
};

function pickMealType(value: unknown): VisionResult["mealType"] {
  if (value === "早餐" || value === "午餐" || value === "晚餐" || value === "加餐") return value;
  return undefined;
}

function stripCodeFence(text: string) {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseVisionJson(rawText: string, provider: string): VisionResult | null {
  const text = stripCodeFence(rawText);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  const snippet = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(snippet) as Record<string, unknown>;
    const foodName = String(parsed.foodName ?? "").trim();
    const caloriesRaw = Number(parsed.calories ?? parsed.kcal ?? 0);
    const confidenceRaw = Number(parsed.confidence ?? 0.65);
    if (!foodName || !Number.isFinite(caloriesRaw) || caloriesRaw <= 0) return null;
    const numberField = (key: string, fallback: number) => {
      const value = Number(parsed[key]);
      return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
    };
    return {
      foodName,
      calories: Math.max(20, Math.round(caloriesRaw)),
      confidence: Math.max(0.01, Math.min(1, Number.isFinite(confidenceRaw) ? confidenceRaw : 0.65)),
      mealType: pickMealType(parsed.mealType),
      note: typeof parsed.note === "string" ? parsed.note : undefined,
      carbs: numberField("carbs", Math.round(Math.max(20, caloriesRaw * 0.12))),
      protein: numberField("protein", Math.round(Math.max(6, caloriesRaw * 0.045))),
      fat: numberField("fat", Math.round(Math.max(4, caloriesRaw * 0.035))),
      fiber: numberField("fiber", Math.round(Math.max(1, caloriesRaw * 0.008))),
      vitamins:
        typeof parsed.vitamins === "string" && parsed.vitamins.trim()
          ? parsed.vitamins.trim().slice(0, 80)
          : "维生素/矿物质需结合食材确认",
      portion:
        typeof parsed.portion === "string" && parsed.portion.trim()
          ? parsed.portion.trim().slice(0, 48)
          : "约 1 份",
      provider,
    };
  } catch {
    return null;
  }
}

async function recognizeViaProvider(args: {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
  dataUrl: string;
  hint?: string;
}) {
  const { provider, apiKey, baseURL, model, dataUrl, hint } = args;
  const client = new OpenAI({ apiKey, baseURL });
  const prompt = [
    "请识别图片中的主要食物，并按营养师口径估算总热量与宏量营养。",
    "请结合可见分量、烹饪方式、油脂/酱料可能性进行保守估算。",
    "必须只返回 JSON：",
    '{"foodName":"食物名","portion":"约250g/一碗/一份","calories":450,"carbs":55,"protein":24,"fat":16,"fiber":5,"vitamins":"维生素C、钾、叶酸等","confidence":0.82,"mealType":"早餐|午餐|晚餐|加餐","note":"一句专业但简短的营养说明"}',
    "不要输出任何额外文字。",
    hint ? `用户补充：${hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "你是食物识别与热量估算助手，输出严格 JSON。" },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as never,
      },
    ],
  });
  const content = response.choices?.[0]?.message?.content?.trim() ?? "";
  return parseVisionJson(content, `${provider} · ${model}`);
}

async function recognizeFood(dataUrl: string, hint?: string): Promise<VisionResult> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
  const deepseekBase = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
  const deepseekVisionModel = process.env.DEEPSEEK_VISION_MODEL?.trim();

  if (deepseekKey && deepseekVisionModel) {
    try {
      const result = await recognizeViaProvider({
        provider: "DeepSeek",
        apiKey: deepseekKey,
        baseURL: deepseekBase,
        model: deepseekVisionModel,
        dataUrl,
        hint,
      });
      if (result) return result;
    } catch {
      // fallback to next provider
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (openaiKey) {
    try {
      const result = await recognizeViaProvider({
        provider: "OpenAI",
        apiKey: openaiKey,
        baseURL: "https://api.openai.com/v1",
        model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4.1-mini",
        dataUrl,
        hint,
      });
      if (result) return result;
    } catch {
      // fallback estimate
    }
  }

  return {
    foodName: hint?.trim() || "拍摄食物",
    calories: 420,
    carbs: 52,
    protein: 18,
    fat: 14,
    fiber: 5,
    vitamins: "维生素与矿物质需结合食材确认",
    portion: "约 1 份",
    confidence: 0.42,
    note: "当前视觉模型不可用，已用基础估算，建议手动确认。",
    provider: "Fallback Estimate",
    usedFallback: true,
  };
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const hint = typeof formData.get("hint") === "string" ? String(formData.get("hint")) : "";
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json({ error: "Empty image file" }, { status: 400 });
    }
    if (bytes.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Image is too large (>8MB)" }, { status: 413 });
    }

    const mime = file.type || "image/jpeg";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    const recognized = await recognizeFood(dataUrl, hint);

    return NextResponse.json({
      provider: recognized.provider,
      usedFallback: Boolean(recognized.usedFallback),
      result: recognized,
      state: getAppState(),
    });
  } catch {
    return NextResponse.json({ error: "Food recognition failed" }, { status: 500 });
  }
}
