import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  addChatMessage,
  addMemory,
  getAppState,
  incrementWaterCups,
  toggleTodayPlan,
  updateUserSettings,
} from "@/lib/db";

export const runtime = "nodejs";

type ActionType =
  | "increment-water"
  | "open-surprise"
  | "start-relax"
  | "play-story"
  | "play-music"
  | "start-stretch"
  | "meal-photo"
  | "dinner-suggestion"
  | "reflect-today"
  | "write-diary"
  | "data-sync"
  | "toggle-reminders"
  | "toggle-voice-companion"
  | "emotion-support"
  | "recommendation-play"
  | "night-reminder-fired"
  | "toggle-plan";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clampText(text: string, max = 36) {
  const normalized = normalizeText(text);
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

function memorySnippet(item: ReturnType<typeof getAppState>["memories"][number]) {
  if (item.type === "water") return "你有认真补水，身体会慢慢感谢你";
  if (item.type === "exercise") return "你今天有给身体一点活动和恢复的时间";
  if (item.type === "diet") return "你有在留意饮食，这份照顾很重要";
  if (item.type === "emotion") return "你愿意把情绪说出来，这是很有力量的一步";
  if (item.type === "small_happiness") return "你没有错过生活里的小确幸";
  if (item.type === "moment") return "你给自己留出过几分钟安静时光";
  if (item.type === "sleep") return "你有在关注休息节奏，恢复力会更稳";
  return clampText(item.content);
}

function buildTodaySummary(state: ReturnType<typeof getAppState>) {
  const picked: string[] = [];
  const usedTypes = new Set<string>();
  const seenSnippets = new Set<string>();
  for (const item of state.memories) {
    if (item.type === "ai_summary") continue;
    if (usedTypes.has(item.type)) continue;

    const snippet = memorySnippet(item);
    if (!snippet) continue;
    if (seenSnippets.has(snippet)) continue;
    usedTypes.add(item.type);
    seenSnippets.add(snippet);
    picked.push(snippet);
    if (picked.length >= 4) break;
  }

  if (!picked.length) {
    return "今天你已经做了不少事，也愿意照顾自己的情绪，这很珍贵。";
  }

  return `今天你留下了这些瞬间：${picked.join("；")}。辛苦了，先允许自己慢慢松下来。`;
}

function actionError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as {
    action?: ActionType;
    payload?: Record<string, unknown>;
  };

  const action = body.action;
  const payload = body.payload ?? {};
  if (!action) {
    return actionError("Missing action");
  }

  let toast = "已为你更新";

  switch (action) {
    case "increment-water": {
      const cups = incrementWaterCups(1);
      addMemory({
        type: "water",
        title: "你喝下了一杯温水",
        content: `已记录今日第 ${cups} 杯水，小悦会继续温柔提醒你补水。`,
        mood: "被照顾",
        time: "刚刚",
        tags: ["喝水", "身体照顾"],
      });
      toast = `已记录喝水 +1（今天 ${cups} 杯）`;
      break;
    }
    case "toggle-plan": {
      const planId = typeof payload.planId === "string" ? payload.planId : "";
      const plan = toggleTodayPlan(planId);
      if (!plan) {
        return actionError("Plan not found", 404);
      }
      toast = plan.done ? `已完成：${plan.title}` : `已重新加入今日计划：${plan.title}`;
      break;
    }
    case "open-surprise": {
      const surprises = [
        "你已经做得很棒了，今晚可以放心慢下来。",
        "允许自己先休息 10 分钟，也是一种认真生活。",
        "你值得被奖励，哪怕只是为自己泡一杯热茶。",
      ];
      const text = surprises[Math.floor(Math.random() * surprises.length)];
      addMemory({
        type: "small_happiness",
        title: "小悦的今晚小惊喜",
        content: text,
        mood: "温暖",
        time: "刚刚",
        tags: ["小惊喜", "鼓励"],
      });
      addChatMessage("assistant", text);
      toast = "小惊喜已打开，已收进时光记";
      break;
    }
    case "start-relax": {
      const tip = "好，我们先做 5 分钟呼吸：吸气 4 秒，停 2 秒，呼气 6 秒。";
      addChatMessage("assistant", tip);
      addMemory({
        type: "moment",
        title: "开始了 5 分钟呼吸放松",
        content: "你愿意照顾自己，就是今天很重要的一步。",
        mood: "放松",
        time: "刚刚",
        tags: ["呼吸", "放松"],
      });
      toast = "放松引导已开始";
      break;
    }
    case "play-story": {
      addChatMessage("assistant", "晚安故事开始了：今晚的主角很累，但他没有放弃照顾自己。");
      addMemory({
        type: "emotion",
        title: "听了晚安故事",
        content: "给自己留一点安静时间，夜晚会慢慢变柔软。",
        mood: "平静",
        time: "刚刚",
        tags: ["晚安故事", "陪伴"],
      });
      toast = "晚安故事已播放";
      break;
    }
    case "play-music": {
      addChatMessage("assistant", "温和音乐已开始，跟着呼吸慢慢放松就好。");
      addMemory({
        type: "emotion",
        title: "开启了温和音乐",
        content: "你在主动给自己一个更轻松的夜晚。",
        mood: "平静",
        time: "刚刚",
        tags: ["音乐", "放松"],
      });
      toast = "温和音乐已播放";
      break;
    }
    case "start-stretch": {
      addMemory({
        type: "exercise",
        title: "完成睡前拉伸",
        content: "短短几分钟拉伸，也在帮身体恢复能量。",
        mood: "轻松",
        time: "刚刚",
        tags: ["拉伸", "恢复"],
      });
      addChatMessage("assistant", "拉伸开始啦，动作轻一点，身体会谢谢你。");
      toast = "拉伸计划已开始";
      break;
    }
    case "meal-photo": {
      addMemory({
        type: "diet",
        title: "拍照识餐已记录",
        content: "识别结果：这餐热量中等，建议配一份蔬菜和一杯温水。",
        mood: "安心",
        time: "刚刚",
        tags: ["饮食", "识餐"],
      });
      toast = "已完成拍照识餐并写入饮食记录";
      break;
    }
    case "dinner-suggestion": {
      addChatMessage("assistant", "今晚可以试试清淡一点：蛋白 + 蔬菜 + 少量碳水，身体会更舒服。");
      addMemory({
        type: "diet",
        title: "收到了晚餐建议",
        content: "小悦建议：温热清淡，少油少负担，睡前不太晚进食。",
        mood: "被照顾",
        time: "刚刚",
        tags: ["晚餐建议", "饮食平衡"],
      });
      toast = "晚餐建议已发送到陪伴对话";
      break;
    }
    case "reflect-today": {
      const state = getAppState();
      const summaryText = buildTodaySummary(state);
      const latestSummary = state.memories.find((item) => item.type === "ai_summary");
      if (latestSummary && normalizeText(latestSummary.content) === normalizeText(summaryText)) {
        toast = "今天回顾已经是最新了";
        break;
      }
      addMemory({
        type: "ai_summary",
        title: "小悦整理了今天的回顾",
        content: summaryText,
        mood: "被看见",
        time: "刚刚",
        tags: ["今日回顾", "AI回忆录"],
      });
      toast = "今日回顾已生成";
      break;
    }
    case "write-diary": {
      addMemory({
        type: "emotion",
        title: "写下了一篇心情日记",
        content: typeof payload.content === "string" && payload.content.trim() ? payload.content.trim() : "今天先写下一句：我愿意慢慢照顾自己。",
        mood: "真实",
        time: "刚刚",
        tags: ["日记", "情绪"],
      });
      toast = "日记已写入时光记";
      break;
    }
    case "data-sync": {
      updateUserSettings({ dataSynced: false });
      toast = "本地数据库已保存。云同步将在账号服务接入后开放";
      break;
    }
    case "toggle-reminders": {
      if (typeof payload.enabled !== "boolean") {
        return actionError("Missing reminders enabled");
      }
      updateUserSettings({
        remindersEnabled: payload.enabled,
        reminderTime: typeof payload.time === "string" ? payload.time : undefined,
      });
      toast = payload.enabled ? "提醒已开启" : "提醒已关闭";
      break;
    }
    case "toggle-voice-companion": {
      if (typeof payload.enabled !== "boolean") {
        return actionError("Missing voice companion enabled");
      }
      updateUserSettings({ voiceCompanionEnabled: payload.enabled });
      toast = payload.enabled ? "回复自动朗读已开启" : "回复自动朗读已关闭";
      break;
    }
    case "emotion-support": {
      const mood = typeof payload.mood === "string" ? payload.mood : "此刻有点乱";
      addChatMessage("user", `我现在感觉${mood}，想找你聊聊。`);
      addChatMessage("assistant", `我在，${mood}也可以被好好接住。我们先从一句最想说的话开始。`);
      toast = "已把这份情绪交给小悦";
      break;
    }
    case "recommendation-play": {
      const title = typeof payload.title === "string" ? payload.title : "暖心陪伴";
      addMemory({
        type: "moment",
        title: `收听了「${title}」`,
        content: "你给了自己几分钟安静时光，这件事很重要。",
        mood: "安定",
        time: "刚刚",
        tags: ["陪伴语音", "放松"],
      });
      addChatMessage("assistant", `我在播放「${title}」。先把肩膀放松，慢慢呼吸。`);
      toast = `已播放：${title}`;
      break;
    }
    case "night-reminder-fired": {
      const gentle =
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : "到你约定的提醒时间啦。今晚先照顾好自己，喝口水，再慢慢放松。";
      addChatMessage("assistant", gentle);
      addMemory({
        type: "moment",
        title: "晚间提醒已到达",
        content: gentle,
        mood: "被照顾",
        time: "刚刚",
        tags: ["晚间提醒", "小悦陪伴"],
      });
      toast = "晚间提醒已送达";
      break;
    }
    default:
      return actionError("Unknown action");
  }

  return NextResponse.json({
    toast,
    state: getAppState(),
  });
}
