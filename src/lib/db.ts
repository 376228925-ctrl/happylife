import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  AiSuggestion,
  AppStatePayload,
  ChatMessage,
  HealthMetric,
  MemoryItem,
  TodayPlan,
  TodayStatus,
  UserProfile,
  UserSettings,
} from "@/types/app";

type Row = Record<string, unknown>;

const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "happylife.db");

let client: Database.Database | null = null;

export function getDb() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!client) {
    client = new Database(dbPath);
    client.pragma("journal_mode = WAL");
    initialize(client);
  }

  return client;
}

function initialize(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      companion_name TEXT NOT NULL,
      current_mode TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS today_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      sleep_score INTEGER NOT NULL,
      sleep_hours REAL NOT NULL,
      mood_label TEXT NOT NULL,
      energy INTEGER NOT NULL,
      stress INTEGER NOT NULL,
      water_cups INTEGER NOT NULL,
      exercise_minutes INTEGER NOT NULL,
      steps INTEGER NOT NULL,
      diet_balance INTEGER NOT NULL,
      focus_minutes INTEGER NOT NULL,
      completed_tasks INTEGER NOT NULL,
      total_tasks INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_metrics (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      score INTEGER,
      primary_text TEXT NOT NULL,
      status_text TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      ai_comment TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id TEXT PRIMARY KEY,
      scene TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      action_text TEXT NOT NULL,
      target TEXT,
      is_primary INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      mood TEXT,
      time TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      time TEXT NOT NULL,
      emotion_tag TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      reminders_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_time TEXT NOT NULL DEFAULT '21:30',
      data_synced INTEGER NOT NULL DEFAULT 1,
      voice_companion_enabled INTEGER NOT NULL DEFAULT 0,
      voice_auto_play_enabled INTEGER NOT NULL DEFAULT 0,
      voice_tone TEXT NOT NULL DEFAULT 'youth_girl',
      companion_avatar TEXT NOT NULL DEFAULT 'star'
    );

    CREATE TABLE IF NOT EXISTS today_plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      username TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT,
      avatar_url TEXT,
      primary_provider TEXT NOT NULL DEFAULT 'password',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT,
      ip TEXT,
      FOREIGN KEY (user_id) REFERENCES auth_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS phone_login_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_phone_login_codes_phone ON phone_login_codes(phone);

    CREATE TABLE IF NOT EXISTS oauth_states (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      state TEXT NOT NULL UNIQUE,
      redirect_to TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      union_id TEXT,
      nickname TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, provider_user_id),
      FOREIGN KEY (user_id) REFERENCES auth_users(id)
    );
  `);

  const settingColumns = db.prepare("PRAGMA table_info(user_settings)").all() as Array<{ name: string }>;
  const hasVoiceTone = settingColumns.some((column) => column.name === "voice_tone");
  const hasVoiceAutoPlay = settingColumns.some((column) => column.name === "voice_auto_play_enabled");
  const hasCompanionAvatar = settingColumns.some((column) => column.name === "companion_avatar");
  if (!hasVoiceTone) {
    db.exec("ALTER TABLE user_settings ADD COLUMN voice_tone TEXT NOT NULL DEFAULT 'youth_girl';");
  }
  if (!hasVoiceAutoPlay) {
    db.exec("ALTER TABLE user_settings ADD COLUMN voice_auto_play_enabled INTEGER NOT NULL DEFAULT 0;");
  }
  if (!hasCompanionAvatar) {
    db.exec("ALTER TABLE user_settings ADD COLUMN companion_avatar TEXT NOT NULL DEFAULT 'star';");
  }

  const seeded = db
    .prepare("SELECT COUNT(*) as count FROM user_profiles")
    .get() as { count: number };

  if (seeded.count === 0) {
    seed(db);
  }

  const settingsSeeded = db
    .prepare("SELECT COUNT(*) as count FROM user_settings WHERE id = 'user_001'")
    .get() as { count: number };

  if (settingsSeeded.count === 0) {
    db.prepare(`
      INSERT INTO user_settings (id, reminders_enabled, reminder_time, data_synced, voice_companion_enabled, voice_tone, companion_avatar)
      VALUES ('user_001', 1, '21:30', 1, 0, 'youth_girl', 'star')
    `).run();
  }

  // Cloud sync is intentionally disabled until an account-backed service exists.
  db.prepare("UPDATE user_settings SET data_synced = 0 WHERE id = 'user_001'").run();

  const plansSeeded = db
    .prepare("SELECT COUNT(*) as count FROM today_plans")
    .get() as { count: number };

  if (plansSeeded.count === 0) {
    seedTodayPlans(db);
  }
}

function seedTodayPlans(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO today_plans (id, title, category, done, sort_order)
    VALUES (@id, @title, @category, @done, @sort_order)
  `);
  [
    ["plan_water", "睡前再喝一小杯温水", "喝水", 1, 1],
    ["plan_relax", "做 5 分钟呼吸放松", "恢复", 0, 2],
    ["plan_review", "留下一句今天的心情", "记录", 0, 3],
  ].forEach(([id, title, category, done, sort_order]) => {
    insert.run({ id, title, category, done, sort_order });
  });
  syncTodayPlanCount(db);
}

function syncTodayPlanCount(db: Database.Database) {
  const counts = db
    .prepare("SELECT COUNT(*) as total, SUM(done) as completed FROM today_plans")
    .get() as { total: number; completed: number | null };
  db.prepare(`
    UPDATE today_status
    SET completed_tasks = @completed, total_tasks = @total
    WHERE id = (SELECT id FROM today_status ORDER BY date DESC LIMIT 1)
  `).run({
    completed: Number(counts.completed ?? 0),
    total: Number(counts.total ?? 0),
  });
}

function seed(db: Database.Database) {
  const insertProfile = db.prepare(`
    INSERT INTO user_profiles (id, name, companion_name, current_mode)
    VALUES (@id, @name, @companion_name, @current_mode)
  `);
  insertProfile.run({
    id: "user_001",
    name: "豪杰",
    companion_name: "小悦",
    current_mode: "night",
  });

  db.prepare(`
    INSERT INTO user_settings (id, reminders_enabled, reminder_time, data_synced, voice_companion_enabled, voice_tone, companion_avatar)
    VALUES ('user_001', 1, '21:30', 0, 0, 'youth_girl', 'star')
  `).run();

  db.prepare(`
    INSERT INTO today_status (
      date, sleep_score, sleep_hours, mood_label, energy, stress, water_cups,
      exercise_minutes, steps, diet_balance, focus_minutes, completed_tasks, total_tasks
    )
    VALUES (@date, @sleep_score, @sleep_hours, @mood_label, @energy, @stress,
      @water_cups, @exercise_minutes, @steps, @diet_balance, @focus_minutes,
      @completed_tasks, @total_tasks)
  `).run({
    date: "2026-05-28",
    sleep_score: 88,
    sleep_hours: 7.2,
    mood_label: "良好",
    energy: 72,
    stress: 35,
    water_cups: 6,
    exercise_minutes: 35,
    steps: 8632,
    diet_balance: 84,
    focus_minutes: 275,
    completed_tasks: 5,
    total_tasks: 6,
  });

  const metrics = [
    ["sleep", 88, "7小时20分", "昨晚睡得很棒", { bedtime: "22:32", wakeTime: "06:04", deepSleep: "2小时16分", efficiency: "92%", trend: [76, 82, 81, 78, 70, 84, 88] }, "你昨晚深睡占比很棒。今晚 22:15 前上床，睡前 10 分钟做深呼吸放松，会更容易进入睡眠。"],
    ["emotion", 82, "良好", "总体状态良好", { current: "开心", diary: "今天有点累，但也很充实。完成了重要的工作，还做了喜欢的晚餐。希望明天能多一点时间好好休息。", trend: [38, 60, 58, 42, 65, 68, 92] }, "你今天整体平稳，照顾得不错。睡前可以试试 5 分钟呼吸放松，帮身体慢慢收回来。"],
    ["diet", 84, "均衡", "营养整体不错", { intake: 1280, target: 1800, burned: 1680, water: 6, meals: [["早餐", "07:30", "燕麦牛奶粥、煮鸡蛋、蓝莓", 280], ["午餐", "12:30", "糙米饭、清蒸鲈鱼、西兰花、番茄炒蛋", 520], ["晚餐", "18:30", "南瓜小米粥、清炒时蔬、鸡胸肉", 380], ["加餐", "20:30", "无糖酸奶、坚果一小把", 100]] }, "晚上适量补充优质蛋白和膳食纤维，有助于夜间修复与饱腹感，安心好眠。"],
    ["exercise", 86, "活力满满", "今天运动表现很好", { steps: 8632, activeMinutes: 45, calories: 320, distance: 6.2, records: [["晚间快走", "19:10-19:40", "30分钟", "3.6公里", "186千卡"], ["舒缓瑜伽", "18:00-18:30", "30分钟", "", "120千卡"], ["拉伸放松", "12:30-12:45", "15分钟", "", "14千卡"]] }, "今天运动很棒。睡前来一组舒缓拉伸，帮助放松肌肉，也能提升睡眠质量。"],
    ["water", 75, "6杯", "补水充足", { target: 8, progress: 75 }, "先喝一小口温水，身体会轻松一点。不用一次喝很多，我们慢慢来。"],
    ["stress", 72, "适中", "能量充沛", { pressure: 35, energy: 72, fatigue: 40 }, "今天压力不算高，但夜间适合减少输入，给大脑一点安静空间。"],
  ] as const;

  const insertMetric = db.prepare(`
    INSERT INTO health_metrics (id, category, score, primary_text, status_text, detail_json, ai_comment)
    VALUES (@id, @category, @score, @primary_text, @status_text, @detail_json, @ai_comment)
  `);
  for (const metric of metrics) {
    insertMetric.run({
      id: `metric_${metric[0]}`,
      category: metric[0],
      score: metric[1],
      primary_text: metric[2],
      status_text: metric[3],
      detail_json: JSON.stringify(metric[4]),
      ai_comment: metric[5],
    });
  }

  const insertSuggestion = db.prepare(`
    INSERT INTO ai_suggestions (id, scene, title, message, action_text, target, is_primary)
    VALUES (@id, @scene, @title, @message, @action_text, @target, @is_primary)
  `);
  insertSuggestion.run({
    id: "suggestion_night",
    scene: "night",
    title: "试试 5 分钟呼吸放松",
    message: "今晚你有一点疲惫，适合慢下来，好好照顾自己。基于你的今日状态，我为你准备了一个放松建议。",
    action_text: "开始放松",
    target: "ai-suggestion",
    is_primary: 1,
  });
  insertSuggestion.run({
    id: "suggestion_surprise",
    scene: "night",
    title: "今晚有一份小惊喜",
    message: "一份特别的礼物已经为你准备好。",
    action_text: "打开看看",
    target: "memories",
    is_primary: 0,
  });

  addMemory({
    type: "small_happiness",
    title: "今天收到了一份惊喜礼物",
    content: "朋友突然寄来的手账本，真的好感动。",
    mood: "开心",
    time: "今天 20:30",
    tags: ["开心", "感恩"],
  });
  addMemory({
    type: "emotion",
    title: "晚上散步放松了心情",
    content: "夜风很舒服，整个人都平静下来了。",
    mood: "平静",
    time: "昨天 21:15",
    tags: ["平静", "放松"],
  });

  addChatMessage("assistant", "晚上好，豪杰。今天辛苦啦，今晚先慢下来，小悦在这里陪你。");
  addChatMessage("user", "今天有点累，想早点放松。", "疲惫");
  addChatMessage("assistant", "听起来你已经撑了一整天。我们不急着解决所有事，先从一口水和三次慢呼吸开始，好吗？");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function timeNow() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeThemeMode(value: unknown): UserProfile["currentMode"] {
  if (value === "sunrise" || value === "day") return "sunrise";
  if (value === "blossom" || value === "pink") return "blossom";
  return "night";
}

export function getAppState(): AppStatePayload {
  const db = getDb();
  const userRow = db.prepare("SELECT * FROM user_profiles LIMIT 1").get() as Row;
  const settingsRow = db.prepare("SELECT * FROM user_settings WHERE id = 'user_001' LIMIT 1").get() as Row;
  const todayRow = db.prepare("SELECT * FROM today_status ORDER BY date DESC LIMIT 1").get() as Row;
  const metricRows = db.prepare("SELECT * FROM health_metrics").all() as Row[];
  const suggestionRows = db.prepare("SELECT * FROM ai_suggestions").all() as Row[];
  const memoryRows = db.prepare("SELECT * FROM memories ORDER BY created_at DESC").all() as Row[];
  const chatRows = db.prepare("SELECT * FROM chat_messages ORDER BY created_at ASC").all() as Row[];
  const planRows = db.prepare("SELECT * FROM today_plans ORDER BY sort_order ASC").all() as Row[];

  const user: UserProfile = {
    id: String(userRow.id),
    name: String(userRow.name),
    companionName: String(userRow.companion_name),
    currentMode: normalizeThemeMode(userRow.current_mode),
  };

  const settings: UserSettings = {
    remindersEnabled: Boolean(Number(settingsRow.reminders_enabled ?? 1)),
    reminderTime: String(settingsRow.reminder_time ?? "21:30"),
    dataSynced: Boolean(Number(settingsRow.data_synced ?? 1)),
    voiceCompanionEnabled: Boolean(Number(settingsRow.voice_auto_play_enabled ?? 0)),
    voiceTone:
      settingsRow.voice_tone === "soft_girl" || settingsRow.voice_tone === "warm_neutral"
        ? (settingsRow.voice_tone as UserSettings["voiceTone"])
        : "youth_girl",
    companionAvatar:
      settingsRow.companion_avatar === "moon" || settingsRow.companion_avatar === "flower"
        ? (settingsRow.companion_avatar as UserSettings["companionAvatar"])
        : "star",
  };

  const today: TodayStatus = {
    sleepScore: Number(todayRow.sleep_score),
    sleepHours: Number(todayRow.sleep_hours),
    moodLabel: String(todayRow.mood_label),
    energy: Number(todayRow.energy),
    stress: Number(todayRow.stress),
    waterCups: Number(todayRow.water_cups),
    exerciseMinutes: Number(todayRow.exercise_minutes),
    steps: Number(todayRow.steps),
    dietBalance: Number(todayRow.diet_balance),
    focusMinutes: Number(todayRow.focus_minutes),
    completedTasks: Number(todayRow.completed_tasks),
    totalTasks: Number(todayRow.total_tasks),
  };

  const metrics = metricRows.map((row) => ({
    id: String(row.id),
    category: String(row.category) as HealthMetric["category"],
    score: row.score === null ? null : Number(row.score),
    primaryText: String(row.primary_text),
    statusText: String(row.status_text),
    detail: parseJson<Record<string, unknown>>(row.detail_json, {}),
    aiComment: String(row.ai_comment),
  }));

  const suggestions = suggestionRows.map((row) => ({
    id: String(row.id),
    scene: String(row.scene),
    title: String(row.title),
    message: String(row.message),
    actionText: String(row.action_text),
    target: row.target ? (String(row.target) as AiSuggestion["target"]) : null,
    isPrimary: Boolean(row.is_primary),
  }));

  const memories = memoryRows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    content: String(row.content),
    mood: row.mood ? String(row.mood) : null,
    time: String(row.time),
    tags: parseJson<string[]>(row.tags_json, []),
  }));

  const chat = chatRows.map((row) => ({
    id: String(row.id),
    role: String(row.role) as ChatMessage["role"],
    content: String(row.content),
    time: String(row.time),
    emotionTag: row.emotion_tag ? String(row.emotion_tag) : null,
  }));

  const plans = planRows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    category: String(row.category),
    done: Boolean(Number(row.done)),
  }));

  return { user, settings, today, metrics, suggestions, memories, chat, plans };
}

export function addMemory(input: Omit<MemoryItem, "id">) {
  const db = getDb();
  const item = { id: id("memory"), ...input };
  db.prepare(`
    INSERT INTO memories (id, type, title, content, mood, time, tags_json)
    VALUES (@id, @type, @title, @content, @mood, @time, @tags_json)
  `).run({ ...item, tags_json: JSON.stringify(input.tags) });
  return item;
}

export function addChatMessage(role: ChatMessage["role"], content: string, emotionTag?: string | null) {
  const db = getDb();
  const message = { id: id("msg"), role, content, time: timeNow(), emotionTag };
  db.prepare(`
    INSERT INTO chat_messages (id, role, content, time, emotion_tag)
    VALUES (@id, @role, @content, @time, @emotionTag)
  `).run(message);
  return message;
}

export function updateUserMode(mode: UserProfile["currentMode"]) {
  const db = getDb();
  db.prepare("UPDATE user_profiles SET current_mode = @mode WHERE id = 'user_001'").run({
    mode: normalizeThemeMode(mode),
  });
}

export function updateUserName(name: string) {
  const normalized = name.trim();
  if (!normalized) return;
  const db = getDb();
  db.prepare("UPDATE user_profiles SET name = @name WHERE id = 'user_001'").run({
    name: normalized.slice(0, 20),
  });
}

type UserSettingsPatch = Partial<UserSettings>;

export function updateUserSettings(patch: UserSettingsPatch) {
  const assignments: string[] = [];
  const values: Record<string, unknown> = {};

  if (typeof patch.remindersEnabled === "boolean") {
    assignments.push("reminders_enabled = @reminders_enabled");
    values.reminders_enabled = patch.remindersEnabled ? 1 : 0;
  }

  if (typeof patch.reminderTime === "string" && patch.reminderTime.trim()) {
    assignments.push("reminder_time = @reminder_time");
    values.reminder_time = patch.reminderTime.trim();
  }

  if (typeof patch.dataSynced === "boolean") {
    assignments.push("data_synced = @data_synced");
    values.data_synced = patch.dataSynced ? 1 : 0;
  }

  if (typeof patch.voiceCompanionEnabled === "boolean") {
    assignments.push("voice_auto_play_enabled = @voice_auto_play_enabled");
    values.voice_auto_play_enabled = patch.voiceCompanionEnabled ? 1 : 0;
  }

  if (
    patch.voiceTone === "youth_girl" ||
    patch.voiceTone === "soft_girl" ||
    patch.voiceTone === "warm_neutral"
  ) {
    assignments.push("voice_tone = @voice_tone");
    values.voice_tone = patch.voiceTone;
  }

  if (
    patch.companionAvatar === "star" ||
    patch.companionAvatar === "moon" ||
    patch.companionAvatar === "flower"
  ) {
    assignments.push("companion_avatar = @companion_avatar");
    values.companion_avatar = patch.companionAvatar;
  }

  if (!assignments.length) return;

  const db = getDb();
  db.prepare(`UPDATE user_settings SET ${assignments.join(", ")} WHERE id = 'user_001'`).run(values);
}

function getTodayStatusRow() {
  const db = getDb();
  return db.prepare("SELECT * FROM today_status ORDER BY date DESC LIMIT 1").get() as Row;
}

export function incrementWaterCups(amount = 1) {
  const current = getTodayStatusRow();
  const next = Math.max(0, Math.min(12, Number(current.water_cups) + amount));
  const db = getDb();
  db.prepare("UPDATE today_status SET water_cups = @water WHERE id = @id").run({
    water: next,
    id: Number(current.id),
  });

  const metricRow = db.prepare("SELECT detail_json FROM health_metrics WHERE category = 'water' LIMIT 1").get() as Row | undefined;
  if (metricRow?.detail_json) {
    const detail = parseJson<Record<string, unknown>>(metricRow.detail_json, {});
    const target = Number(detail.target ?? 8) || 8;
    detail.water = next;
    detail.target = target;
    detail.progress = Math.min(100, Math.round((next / target) * 100));
    db.prepare("UPDATE health_metrics SET detail_json = @detail_json WHERE category = 'water'").run({
      detail_json: JSON.stringify(detail),
    });
  }

  return next;
}

export function toggleTodayPlan(planId: string) {
  const db = getDb();
  const plan = db
    .prepare("SELECT * FROM today_plans WHERE id = @id LIMIT 1")
    .get({ id: planId }) as Row | undefined;
  if (!plan) return null;
  const nextDone = Number(plan.done) ? 0 : 1;
  db.prepare("UPDATE today_plans SET done = @done WHERE id = @id").run({
    id: planId,
    done: nextDone,
  });
  syncTodayPlanCount(db);
  return {
    id: String(plan.id),
    title: String(plan.title),
    category: String(plan.category),
    done: Boolean(nextDone),
  } satisfies TodayPlan;
}

type MealRecognitionInput = {
  foodName: string;
  calories: number;
  confidence?: number;
  note?: string;
  mealType?: "早餐" | "午餐" | "晚餐" | "加餐";
  source?: string;
  carbs?: number;
  protein?: number;
  fat?: number;
  fiber?: number;
  vitamins?: string;
};

function inferMealType(now = new Date()) {
  const hour = now.getHours();
  if (hour < 10) return "早餐";
  if (hour < 15) return "午餐";
  if (hour < 21) return "晚餐";
  return "加餐";
}

function computeDietBalance(intake: number, target: number) {
  const safeTarget = Math.max(1200, target);
  const ratio = intake / safeTarget;
  const score = 94 - Math.abs(ratio - 0.82) * 52;
  return Math.max(55, Math.min(95, Math.round(score)));
}

function computeDietStatusText(intake: number, target: number) {
  const ratio = intake / Math.max(1200, target);
  if (ratio < 0.62) return "摄入偏少";
  if (ratio <= 1.02) return "营养整体不错";
  if (ratio <= 1.2) return "稍微偏多";
  return "今晚摄入偏高";
}

export function addRecognizedMealRecord(input: MealRecognitionInput) {
  const db = getDb();
  const normalizedFood = input.foodName.trim() || "未知食物";
  const calories = Math.max(20, Math.round(input.calories || 0));
  const mealType = input.mealType ?? inferMealType();
  const now = timeNow();

  const metricRow = db
    .prepare("SELECT detail_json FROM health_metrics WHERE category = 'diet' LIMIT 1")
    .get() as Row | undefined;
  const todayRow = getTodayStatusRow();
  const metricDetail = parseJson<Record<string, unknown>>(metricRow?.detail_json, {});

  const intakeBefore = Number(metricDetail.intake ?? 1280);
  const target = Number(metricDetail.target ?? 1800);
  const burned = Number(metricDetail.burned ?? 1680);
  const water = Number(metricDetail.water ?? 6);
  const meals = Array.isArray(metricDetail.meals) ? [...(metricDetail.meals as Array<[string, string, string, number]>)] : [];
  meals.unshift([mealType, now, normalizedFood, calories]);
  const nextMeals = meals.slice(0, 10);
  const intakeAfter = intakeBefore + calories;
  const nextBalance = computeDietBalance(intakeAfter, target);
  const statusText = computeDietStatusText(intakeAfter, target);

  db.prepare("UPDATE today_status SET diet_balance = @diet_balance WHERE id = @id").run({
    diet_balance: nextBalance,
    id: Number(todayRow.id),
  });

  db.prepare(`
    UPDATE health_metrics
    SET score = @score, status_text = @status_text, detail_json = @detail_json
    WHERE category = 'diet'
  `).run({
    score: nextBalance,
    status_text: statusText,
    detail_json: JSON.stringify({
      ...metricDetail,
      intake: intakeAfter,
      target,
      burned,
      water,
      meals: nextMeals,
    }),
  });

  const sourceLabel = input.source ? `（来源：${input.source}）` : "";
  const confidence =
    typeof input.confidence === "number" ? `${Math.round(Math.max(0, Math.min(1, input.confidence)) * 100)}%` : "估算";
  const nutritionSummary = [
    typeof input.carbs === "number" ? `碳水 ${Math.round(input.carbs)}g` : "",
    typeof input.protein === "number" ? `蛋白质 ${Math.round(input.protein)}g` : "",
    typeof input.fat === "number" ? `脂肪 ${Math.round(input.fat)}g` : "",
    typeof input.fiber === "number" ? `膳食纤维 ${Math.round(input.fiber)}g` : "",
    input.vitamins ? `维生素/矿物质：${input.vitamins}` : "",
  ].filter(Boolean);
  addMemory({
    type: "diet",
    title: `拍照识餐：${normalizedFood}`,
    content: `识别热量约 ${calories} kcal，置信度 ${confidence}${sourceLabel}${
      nutritionSummary.length ? `。${nutritionSummary.join("，")}` : ""
    }${input.note ? `。${input.note}` : ""}`,
    mood: "安心",
    time: "刚刚",
    tags: ["拍照识餐", mealType],
  });

  return {
    foodName: normalizedFood,
    calories,
    intakeAfter,
    target,
    balance: nextBalance,
    statusText,
    carbs: input.carbs,
    protein: input.protein,
    fat: input.fat,
    fiber: input.fiber,
    vitamins: input.vitamins,
  };
}

export function classifyQuickRecord(text: string) {
  const lower = text.trim();
  if (/吃|饭|餐|奶茶|咖啡|水果|炸鸡|外卖/.test(lower)) return "diet";
  if (/睡|困|失眠|醒|梦/.test(lower)) return "sleep";
  if (/水|渴/.test(lower)) return "water";
  if (/跑|走|运动|拉伸|瑜伽/.test(lower)) return "exercise";
  if (/开心|感动|惊喜|喜欢|完成|被夸|夸我|称赞/.test(lower)) return "small_happiness";
  return "emotion";
}

function updateMetricDetail(category: HealthMetric["category"], patch: Record<string, unknown>) {
  const db = getDb();
  const row = db
    .prepare("SELECT detail_json FROM health_metrics WHERE category = @category LIMIT 1")
    .get({ category }) as Row | undefined;
  const detail = parseJson<Record<string, unknown>>(row?.detail_json, {});
  db.prepare("UPDATE health_metrics SET detail_json = @detail_json WHERE category = @category").run({
    category,
    detail_json: JSON.stringify({ ...detail, ...patch }),
  });
}

function firstNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function applyQuickRecordImpact(type: string, text: string) {
  const db = getDb();
  const today = getTodayStatusRow();

  if (type === "water") {
    const mentioned = firstNumber(text, /(\d+(?:\.\d+)?)\s*(?:杯|瓶|次)/);
    const amount = Math.max(1, Math.min(4, Math.round(mentioned ?? 1)));
    const cups = incrementWaterCups(amount);
    return `今日饮水已更新为 ${cups} 杯`;
  }

  if (type === "exercise") {
    const mentionedMinutes = firstNumber(text, /(\d+(?:\.\d+)?)\s*(?:分钟|分)/);
    const mentionedSteps = firstNumber(text, /(\d+(?:\.\d+)?)\s*步/);
    const minutes = Math.max(5, Math.min(180, Math.round(mentionedMinutes ?? 10)));
    const addedSteps = Math.max(0, Math.min(30000, Math.round(mentionedSteps ?? minutes * 90)));
    const nextMinutes = Number(today.exercise_minutes) + minutes;
    const nextSteps = Number(today.steps) + addedSteps;
    db.prepare("UPDATE today_status SET exercise_minutes = @minutes, steps = @steps WHERE id = @id").run({
      id: Number(today.id),
      minutes: nextMinutes,
      steps: nextSteps,
    });
    updateMetricDetail("exercise", { activeMinutes: nextMinutes, steps: nextSteps });
    return `今日活动已增加 ${minutes} 分钟`;
  }

  if (type === "sleep") {
    const mentionedHours = firstNumber(text, /(\d+(?:\.\d+)?)\s*(?:小时|h)/i);
    const currentHours = Number(today.sleep_hours);
    const hours = Math.max(0, Math.min(14, mentionedHours ?? currentHours));
    const negative = /失眠|睡不着|没睡好|醒了|困/.test(text);
    const positive = /睡得好|睡得不错|休息好/.test(text);
    const currentScore = Number(today.sleep_score);
    const score = Math.max(35, Math.min(98, mentionedHours ? Math.round(68 + (hours - 6) * 9) : currentScore + (positive ? 4 : negative ? -5 : 0)));
    const statusText = negative ? "今晚需要多一点休息" : positive ? "恢复得不错" : "睡眠状态已记录";
    db.prepare("UPDATE today_status SET sleep_hours = @hours, sleep_score = @score WHERE id = @id").run({
      id: Number(today.id),
      hours,
      score,
    });
    db.prepare(`
      UPDATE health_metrics
      SET score = @score, primary_text = @primary_text, status_text = @status_text
      WHERE category = 'sleep'
    `).run({ score, primary_text: `${hours.toFixed(1)}小时`, status_text: statusText });
    return "睡眠状态已同步到健康档案";
  }

  if (type === "emotion") {
    const low = /焦虑|难过|委屈|烦|累|疲惫|压力|不开心|崩溃/.test(text);
    const happy = /开心|高兴|轻松|平静|放松|不错/.test(text);
    const moodLabel = low ? "需要关怀" : happy ? "良好" : "已记录";
    const stress = Math.max(10, Math.min(95, Number(today.stress) + (low ? 8 : happy ? -4 : 0)));
    const energy = Math.max(10, Math.min(95, Number(today.energy) + (low ? -5 : happy ? 3 : 0)));
    db.prepare("UPDATE today_status SET mood_label = @mood, stress = @stress, energy = @energy WHERE id = @id").run({
      id: Number(today.id),
      mood: moodLabel,
      stress,
      energy,
    });
    db.prepare(`
      UPDATE health_metrics
      SET primary_text = @mood, status_text = @status_text
      WHERE category = 'emotion'
    `).run({ mood: moodLabel, status_text: low ? "小悦会多陪你一会儿" : "总体状态已更新" });
    updateMetricDetail("emotion", { current: moodLabel, diary: text });
    updateMetricDetail("stress", { pressure: stress, energy, fatigue: low ? 56 : 40 });
    return "情绪与压力状态已更新";
  }

  return "已经收进你的时光记";
}

if (process.argv[1]?.endsWith("db.ts")) {
  getDb();
  console.log(`SQLite database is ready at ${dbPath}`);
}
