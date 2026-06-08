"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Database,
  Download,
  Droplets,
  Heart,
  Home,
  KeyRound,
  Leaf,
  LogOut,
  MessageCircle,
  Moon,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Upload,
  User,
  Volume2,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { useAppStore } from "@/store/appStore";
import type { AppStatePayload, CompanionAvatar, MemoryItem, Screen, ThemeMode } from "@/types/app";

type Tab = "home" | "companion" | "plus" | "memories" | "my";

type ActionName =
  | "increment-water"
  | "open-surprise"
  | "start-relax"
  | "play-story"
  | "play-music"
  | "start-stretch"
  | "meal-photo"
  | "confirm-meal"
  | "dinner-suggestion"
  | "reflect-today"
  | "write-diary"
  | "data-sync"
  | "toggle-reminders"
  | "toggle-voice-companion"
  | "emotion-support"
  | "recommendation-play"
  | "night-reminder-fired"
  | "toggle-plan"
  | "confirm-meal";

type ActionResponse = {
  state: AppStatePayload;
  toast?: string;
  error?: string;
  message?: string;
};

type Capability = {
  id: string;
  label: string;
  status: "ready" | "limited" | "pending";
  detail: string;
};

type AuthUser = {
  id: string;
  displayName: string;
  username: string | null;
  phone: string | null;
  avatarUrl: string | null;
  primaryProvider: string;
};

type RecognizedFoodDraft = {
  foodName: string;
  portion: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  vitamins: string;
  confidence: number;
  mealType?: "早餐" | "午餐" | "晚餐" | "加餐";
  note?: string;
  provider?: string;
  usedFallback?: boolean;
};

function parseReminderToNextDelay(reminderTime: string) {
  const [hh, mm] = reminderTime.split(":").map((v) => Number(v));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return null;
  }
  const now = new Date();
  const next = new Date();
  next.setHours(Math.max(0, Math.min(23, hh)), Math.max(0, Math.min(59, mm)), 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function pickVoiceByTone(voices: SpeechSynthesisVoice[], tone: AppStatePayload["settings"]["voiceTone"]) {
  const zhVoices = voices.filter(
    (voice) =>
      /zh|cmn|yue/i.test(voice.lang) ||
      /ting|xiao|mei|sin|yi|hui|yu|chinese|mandarin|中文|普通话/i.test(voice.name.toLowerCase()),
  );
  const pool = zhVoices.length ? zhVoices : voices;
  const byKeywords = (keywords: string[]) =>
    pool.find((voice) => keywords.some((keyword) => voice.name.toLowerCase().includes(keyword)));

  if (tone === "youth_girl") {
    return byKeywords(["xiaoxiao", "xiaoyi", "tingting", "meijia", "sin-ji", "sinji", "google 普通话"]);
  }
  if (tone === "soft_girl") {
    return byKeywords(["tingting", "sin-ji", "sinji", "mei-jia", "meijia", "xiaoyu"]);
  }
  return byKeywords(["yunxi", "huihui", "mandarin", "chinese"]);
}

async function waitVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [] as SpeechSynthesisVoice[];
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length) return existing;
  return await new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(synth.getVoices());
    }, 1000);
    const handler = () => {
      cleanup();
      resolve(synth.getVoices());
    };
    function cleanup() {
      window.clearTimeout(timer);
      synth.removeEventListener("voiceschanged", handler);
    }
    synth.addEventListener("voiceschanged", handler);
  });
}

let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
type VoicePlayResult = "cloud" | "system" | "unavailable";

function stopVoice() {
  if (typeof window === "undefined") return;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

async function speak(
  text: string,
  tone: AppStatePayload["settings"]["voiceTone"],
  onState?: (speaking: boolean) => void,
): Promise<VoicePlayResult> {
  if (typeof window === "undefined") return "unavailable";
  const content = text.trim();
  if (!content) return "unavailable";
  stopVoice();

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: content, tone }),
    });
    if (response.ok) {
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      activeAudio = audio;
      activeAudioUrl = url;
      audio.onplay = () => onState?.(true);
      audio.onended = () => {
        onState?.(false);
        stopVoice();
      };
      audio.onerror = () => {
        onState?.(false);
        stopVoice();
      };
      await audio.play();
      return "cloud";
    }
  } catch {
    // Keep voice output quiet when cloud TTS is unavailable.
  }

  const allowSystemVoice =
    typeof window !== "undefined" && window.localStorage.getItem("happylife_allow_system_voice") === "1";
  if (!allowSystemVoice) {
    onState?.(false);
    return "unavailable";
  }

  if (!("speechSynthesis" in window)) return "unavailable";
  const synth = window.speechSynthesis;

  const utterance = new SpeechSynthesisUtterance(content.replace(/\n+/g, " ").trim());
  const voices = await waitVoices();
  const picked = pickVoiceByTone(voices, tone);
  if (picked) utterance.voice = picked;
  utterance.lang = "zh-CN";
  if (tone === "youth_girl") {
    utterance.rate = 1.05;
    utterance.pitch = 1.28;
  } else if (tone === "soft_girl") {
    utterance.rate = 0.96;
    utterance.pitch = 1.14;
  } else {
    utterance.rate = 0.94;
    utterance.pitch = 1.02;
  }
  utterance.onstart = () => onState?.(true);
  utterance.onend = () => onState?.(false);
  utterance.onerror = () => onState?.(false);
  synth.speak(utterance);
  return "system";
}

export default function Page() {
  const { screen, previousScreen, activeTab, mode, setMode, setScreen } = useAppStore();
  const [state, setState] = useState<AppStatePayload | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const reminderTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const syncViewport = () => {
      const viewport = window.visualViewport;
      const width = Math.floor(viewport?.width || window.innerWidth || root.clientWidth);
      const height = Math.floor(viewport?.height || window.innerHeight || root.clientHeight);
      root.style.setProperty("--app-vvw", `${width}px`);
      root.style.setProperty("--app-vvh", `${height}px`);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      root.style.removeProperty("--app-vvw");
      root.style.removeProperty("--app-vvh");
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  async function runAction(action: ActionName, payload?: Record<string, unknown>) {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = (await response.json()) as ActionResponse;
    if (!response.ok) {
      showToast(result.message || result.error || "操作失败，请稍后重试");
      return null;
    }
    setState(result.state);
    if (result.toast) {
      showToast(result.toast);
    }
    return result;
  }

  const loadAppState = useCallback(async (nextAuthUser?: AuthUser) => {
    const response = await fetch("/api/app-state", { cache: "no-store" });
    if (response.status === 401) {
      setAuthUser(null);
      setState(null);
      setLoading(false);
      return;
    }
    const payload = (await response.json()) as AppStatePayload;
    setState(payload);
    if (nextAuthUser) {
      setAuthUser(nextAuthUser);
    }
    setMode(payload.user.currentMode);
    setLoading(false);
  }, [setMode]);

  async function finishAuth(user: AuthUser) {
    setLoading(true);
    await loadAppState(user);
    showToast("欢迎回来，小悦已经准备好了");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    stopVoice();
    setAuthUser(null);
    setState(null);
    setScreen("home", "home");
    showToast("已退出登录");
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("auth_error");
      if (authError) {
        showToast(authError);
        window.history.replaceState({}, "", window.location.pathname);
      }

      const authResponse = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (!authResponse?.ok) {
        if (alive) setLoading(false);
        return;
      }
      const authPayload = (await authResponse.json()) as { authenticated?: boolean; user?: AuthUser | null };
      if (!alive) return;
      if (!authPayload.authenticated || !authPayload.user) {
        setLoading(false);
        return;
      }
      setAuthUser(authPayload.user);
      await loadAppState(authPayload.user);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [loadAppState, setScreen, showToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (reminderTimerRef.current) {
        window.clearTimeout(reminderTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let rafA = 0;
    let rafB = 0;
    rafA = requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
      rafB = requestAnimationFrame(() => {
        contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    });
    return () => {
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
    };
  }, [screen]);

  useEffect(() => {
    if (!state?.settings.remindersEnabled) {
      if (reminderTimerRef.current) {
        window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = null;
      }
      return;
    }

    const delay = parseReminderToNextDelay(state.settings.reminderTime);
    if (!delay) return;

    if (reminderTimerRef.current) {
      window.clearTimeout(reminderTimerRef.current);
    }
    reminderTimerRef.current = window.setTimeout(async () => {
      const content = "到你约定的提醒时间啦。今晚先照顾好自己，喝口水，再慢慢放松。";
      showToast(content);

      if ("Notification" in window) {
        if (Notification.permission === "default") {
          await Notification.requestPermission().catch(() => undefined);
        }
        if (Notification.permission === "granted") {
          new Notification("幸福人生 · 晚间提醒", { body: content });
        }
      }

      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "night-reminder-fired", payload: { message: content } }),
      }).catch(() => null);
      if (!response || !response.ok) return;
      const result = (await response.json()) as ActionResponse;
      if (result.state) {
        setState(result.state);
      }
    }, delay);

    return () => {
      if (reminderTimerRef.current) {
        window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = null;
      }
    };
  }, [showToast, state?.settings.remindersEnabled, state?.settings.reminderTime]);

  if (loading) {
    return (
      <main className={clsx("app-frame", `theme-${mode}`)}>
        <NightBackdrop mode={mode} />
        <div className="flex min-h-screen items-center justify-center">
          <motion.div
            className="h-24 w-24 rounded-full bg-[radial-gradient(circle,#ffd9a2_0%,#b18bff_45%,#6d74ff_100%)]"
            animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </main>
    );
  }

  if (!authUser || !state) {
    return (
      <main className={clsx("app-frame", `theme-${mode}`)}>
        <NightBackdrop mode={mode} />
        <div
          className={clsx(
            "phone-shell relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden text-white",
            "md:my-4 md:h-[calc(100dvh-2rem)] md:rounded-[38px] md:border md:border-white/12 md:shadow-2xl",
          )}
        >
          <div className="content-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(26px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
            <AuthScreen onAuthenticated={finishAuth} onNotice={showToast} />
          </div>
          <AnimatePresence>
            {toast && (
              <motion.div
                key={toast}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="pointer-events-none absolute inset-x-4 bottom-[24px] z-40 rounded-[14px] border border-white/20 bg-[#1e2a6f]/95 px-4 py-2.5 text-center text-[13px] text-white shadow-[0_18px_35px_rgba(6,10,38,.45)]"
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    );
  }

  return (
    <main className={clsx("app-frame", `theme-${mode}`)}>
      <NightBackdrop mode={mode} />
      <div
        className={clsx(
          "phone-shell relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden text-white",
          "md:my-4 md:h-[calc(100dvh-2rem)] md:rounded-[38px] md:border md:border-white/12 md:shadow-2xl",
        )}
      >
        <div
          ref={contentRef}
          className="content-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(128px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              className="screen-stack"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {screen === "home" && (
                <HomeScreen
                  state={state}
                  onNavigate={setScreen}
                  mode={mode}
                  onAction={runAction}
                  onNotice={showToast}
                />
              )}
              {screen === "health-overview" && <HealthOverviewScreen state={state} onNavigate={setScreen} />}
              {screen === "sleep-care" && (
                <MetricScreen
                  state={state}
                  category="sleep"
                  onBack={() => setScreen("health-overview")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "emotion-value" && (
                <MetricScreen
                  state={state}
                  category="emotion"
                  onBack={() => setScreen("health-overview")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "diet-health" && (
                <MetricScreen
                  state={state}
                  category="diet"
                  onBack={() => setScreen("health-overview")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "exercise-health" && (
                <MetricScreen
                  state={state}
                  category="exercise"
                  onBack={() => setScreen("health-overview")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "water-reminder" && (
                <MetricScreen
                  state={state}
                  category="water"
                  onBack={() => setScreen("health-overview")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "stress-energy" && (
                <MetricScreen
                  state={state}
                  category="stress"
                  onBack={() => setScreen("health-overview")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "ai-suggestion" && (
                <AiSuggestionScreen
                  state={state}
                  onBack={() => setScreen("home")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "companion" && (
                <CompanionScreen
                  state={state}
                  onState={setState}
                  onNavigate={setScreen}
                  onAction={runAction}
                  onNotice={showToast}
                />
              )}
              {screen === "quick-record" && <QuickRecordScreen onState={setState} onNavigate={setScreen} onNotice={showToast} />}
              {screen === "memories" && (
                <MemoriesScreen
                  memories={state.memories}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "emotion-diary" && (
                <EmotionDiaryScreen
                  state={state}
                  onBack={() => setScreen("emotion-value")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "my" && <MyScreen state={state} authUser={authUser} onState={setState} onAction={runAction} onNotice={showToast} onNavigate={setScreen} onLogout={logout} />}
              {screen === "reminder-settings" && (
                <ReminderSettingsScreen
                  state={state}
                  onState={setState}
                  onBack={() => setScreen("my", "my")}
                  onNotice={showToast}
                />
              )}
              {screen === "voice-settings" && (
                <VoiceSettingsScreen
                  state={state}
                  onState={setState}
                  onBack={() => setScreen("my", "my")}
                  onNotice={showToast}
                />
              )}
              {screen === "theme-settings" && (
                <ThemeSettingsScreen
                  state={state}
                  onState={setState}
                  onBack={() => setScreen("my", "my")}
                  onNotice={showToast}
                />
              )}
              {screen === "companion-avatar-settings" && (
                <CompanionAvatarSettingsScreen
                  state={state}
                  onState={setState}
                  onBack={() => setScreen("my", "my")}
                  onNotice={showToast}
                />
              )}
              {screen === "memory-journal" && (
                <MemoryCollectionScreen
                  state={state}
                  variant="journal"
                  onBack={() => setScreen("memories", "memories")}
                  onNavigate={setScreen}
                />
              )}
              {screen === "memory-gallery" && (
                <MemoryCollectionScreen
                  state={state}
                  variant="gallery"
                  onBack={() => setScreen("memories", "memories")}
                  onNavigate={setScreen}
                />
              )}
              {screen === "small-happiness" && (
                <MemoryCollectionScreen
                  state={state}
                  variant="happiness"
                  onBack={() => setScreen("memories", "memories")}
                  onNavigate={setScreen}
                />
              )}
              {screen === "all-memories" && (
                <MemoryCollectionScreen
                  state={state}
                  variant="all"
                  onBack={() => setScreen("memories", "memories")}
                  onNavigate={setScreen}
                />
              )}
              {screen === "ai-memoir" && (
                <AiMemoirScreen
                  state={state}
                  onBack={() => setScreen("memories", "memories")}
                  onAction={runAction}
                />
              )}
              {screen === "life-timeline" && (
                <LifeTimelineScreen
                  memories={state.memories}
                  onBack={() => setScreen("memories", "memories")}
                />
              )}
              {screen === "relax-session" && (
                <RelaxSessionScreen
                  onBack={() => setScreen(previousScreen)}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
              {screen === "story-player" && (
                <StoryPlayerScreen
                  state={state}
                  onBack={() => setScreen(previousScreen)}
                  onAction={runAction}
                  onNotice={showToast}
                />
              )}
              {screen === "digital-assets" && (
                <DigitalAssetsScreen state={state} onBack={() => setScreen("my", "my")} />
              )}
              {screen === "profile-settings" && (
                <ProfileSettingsScreen
                  state={state}
                  onState={setState}
                  onBack={() => setScreen("my", "my")}
                  onNotice={showToast}
                />
              )}
              {screen === "health-archive" && (
                <HealthArchiveScreen
                  state={state}
                  onBack={() => setScreen("my", "my")}
                  onNavigate={setScreen}
                />
              )}
              {screen === "general-settings" && (
                <GeneralSettingsScreen
                  state={state}
                  onBack={() => setScreen("my", "my")}
                  onNavigate={setScreen}
                  onAction={runAction}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <BottomNav activeTab={activeTab} onNavigate={setScreen} />
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="pointer-events-none absolute inset-x-4 bottom-[108px] z-40 rounded-[14px] border border-white/20 bg-[#1e2a6f]/95 px-4 py-2.5 text-center text-[13px] text-white shadow-[0_18px_35px_rgba(6,10,38,.45)]"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function AuthScreen({
  onAuthenticated,
  onNotice,
}: {
  onAuthenticated: (user: AuthUser) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "phone">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitJson(url: string, body: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { user?: AuthUser; error?: string; message?: string; previewCode?: string };
      if (!response.ok || !payload.user) {
        onNotice(payload.error || payload.message || "登录失败，请检查信息");
        return null;
      }
      await onAuthenticated(payload.user);
      return payload.user;
    } finally {
      setSubmitting(false);
    }
  }

  async function sendPhoneCode() {
    if (!phone.trim()) {
      onNotice("请先填写手机号");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/phone-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; previewCode?: string; delivery?: string };
      if (!response.ok) {
        onNotice(payload.error || "验证码发送失败");
        return;
      }
      setPreviewCode(payload.previewCode ?? null);
      onNotice(payload.delivery === "sms" ? "验证码已发送到手机" : `预览验证码：${payload.previewCode}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function startOAuth(provider: "wechat" | "douyin") {
    const response = await fetch(`/api/auth/oauth/${provider}/start`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
    if (!response.ok || !payload.url) {
      onNotice(payload.message || payload.error || "第三方登录暂未配置");
      return;
    }
    window.location.href = payload.url;
  }

  return (
    <div className="space-y-4 py-2">
      <section className="hero-card min-h-[286px]">
        <Image
          src="/image2/companion-hero.png"
          alt="小悦登录欢迎"
          width={432}
          height={320}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,18,61,.48)_0%,rgba(10,18,61,.28)_58%,rgba(10,18,61,.18)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_90%_at_16%_26%,rgba(10,18,61,.72)_0%,rgba(10,18,61,.42)_48%,rgba(10,18,61,0)_100%)]" />
        <div className="relative z-10 max-w-[62%] p-1">
          <span className="inline-flex rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[12px] text-white/82">
            幸福人生账号
          </span>
          <h1 className="mt-3 text-[27px] font-semibold leading-tight">欢迎回来，宝贝⭐</h1>
          <p className="mt-2 text-[14px] leading-6 text-white/86">登录后，小悦会继续记住你的陪伴、健康和时光。</p>
        </div>
      </section>

      <GlassCard className="p-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            ["login", "密码登录"],
            ["phone", "手机快捷"],
            ["register", "注册账号"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={clsx(
                "rounded-full px-2 py-2 text-[13px] transition",
                mode === key ? "bg-[#a78cff] font-semibold text-white shadow-[0_0_18px_rgba(170,140,255,.45)]" : "bg-white/8 text-white/70",
              )}
              onClick={() => setMode(key as "login" | "register" | "phone")}
            >
              {label}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="space-y-3 p-4">
        {mode === "login" && (
          <>
            <AuthField
              icon={<User className="h-4 w-4" />}
              label="用户名 / 手机号"
              value={identifier}
              onChange={setIdentifier}
              placeholder="例如 haojie 或 13800000000"
            />
            <AuthField
              icon={<KeyRound className="h-4 w-4" />}
              label="密码"
              value={password}
              onChange={setPassword}
              placeholder="请输入密码"
              type="password"
            />
            <button
              className="primary-btn w-full justify-center"
              disabled={submitting}
              onClick={() => void submitJson("/api/auth/login", { identifier, password })}
            >
              {submitting ? "登录中…" : "登录幸福人生"}
            </button>
          </>
        )}

        {mode === "register" && (
          <>
            <AuthField
              icon={<User className="h-4 w-4" />}
              label="昵称"
              value={displayName}
              onChange={setDisplayName}
              placeholder="小悦该怎么称呼你"
            />
            <AuthField
              icon={<ShieldCheck className="h-4 w-4" />}
              label="用户名"
              value={username}
              onChange={setUsername}
              placeholder="3-32 位英文、数字、点或下划线"
            />
            <AuthField
              icon={<KeyRound className="h-4 w-4" />}
              label="密码"
              value={password}
              onChange={setPassword}
              placeholder="至少 8 位"
              type="password"
            />
            <AuthField
              icon={<Smartphone className="h-4 w-4" />}
              label="手机号（可选）"
              value={phone}
              onChange={setPhone}
              placeholder="用于之后快捷登录"
              inputMode="tel"
            />
            <button
              className="primary-btn w-full justify-center"
              disabled={submitting}
              onClick={() => void submitJson("/api/auth/register", { username, displayName, password, phone })}
            >
              {submitting ? "创建中…" : "创建账号并进入"}
            </button>
          </>
        )}

        {mode === "phone" && (
          <>
            <AuthField
              icon={<Smartphone className="h-4 w-4" />}
              label="手机号"
              value={phone}
              onChange={setPhone}
              placeholder="请输入手机号"
              inputMode="tel"
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <AuthField
                icon={<MessageCircle className="h-4 w-4" />}
                label="验证码"
                value={code}
                onChange={setCode}
                placeholder="6 位验证码"
                inputMode="numeric"
              />
              <button className="ghost-btn self-end px-4" disabled={submitting} onClick={() => void sendPhoneCode()}>
                获取验证码
              </button>
            </div>
            {previewCode && (
              <p className="rounded-[12px] border border-amber-200/25 bg-amber-200/12 px-3 py-2 text-[12px] text-amber-100">
                当前未配置短信供应商，预览验证码：{previewCode}
              </p>
            )}
            <button
              className="primary-btn w-full justify-center"
              disabled={submitting}
              onClick={() => void submitJson("/api/auth/phone-login", { phone, code })}
            >
              {submitting ? "登录中…" : "手机号快捷登录"}
            </button>
          </>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <p className="text-[16px] font-semibold">也可以用第三方账号继续</p>
        <p className="mt-1 text-[12px] leading-5 text-white/62">需要在开放平台配置 AppId、Secret 与回调地址后启用。</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="ghost-btn h-11" onClick={() => void startOAuth("wechat")}>
            微信登录
          </button>
          <button className="ghost-btn h-11" onClick={() => void startOAuth("douyin")}>
            抖音登录
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
          <p className="text-[13px] leading-6 text-white/72">
            密码会使用服务端哈希保存；登录会话写入 HttpOnly Cookie，前端脚本无法读取。你的陪伴数据仍保存在当前服务器数据库中。
          </p>
        </div>
      </GlassCard>
    </div>
  );
}

function AuthField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[12px] text-white/68">
        {icon}
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        className="w-full rounded-[15px] border border-white/16 bg-white/9 px-3 py-3 text-[14px] text-white outline-none placeholder:text-white/38"
      />
    </label>
  );
}

function HomeScreen({
  state,
  onNavigate,
  mode,
  onAction,
  onNotice,
}: {
  state: AppStatePayload;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  mode: ThemeMode;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
  onNotice: (message: string) => void;
}) {
  const primarySuggestion = state.suggestions.find((item) => item.isPrimary) ?? state.suggestions[0];
  const greeting =
    mode === "night" ? "晚安,宝贝🌙" : mode === "sunrise" ? "你好,宝贝☀️" : "今天也被爱包围🌸";
  const greetingDesc =
    mode === "night"
      ? "辛苦啦，今晚先慢下来，小悦在这里陪你✨"
      : mode === "sunrise"
        ? "新的一天慢慢来，小悦会陪你把节奏照顾好✨"
        : "把生活调成柔软的粉色，小悦陪你慢慢呼吸✨";
  return (
    <div className="mobile-safe space-y-3 pb-2">
      <div className="flex items-center justify-between px-1">
        <button className="icon-btn" aria-label="菜单" onClick={() => onNavigate("my", "my")}>
          <Sparkles className="h-5 w-5" />
        </button>
        <button className="icon-btn" aria-label="提醒" onClick={() => onNavigate("reminder-settings", "my")}>
          <CalendarDays className="h-5 w-5" />
        </button>
      </div>

      <section className="hero-card min-h-[272px]">
        <Image
          src="/image2/home-hero-night.png"
          alt="小悦夜间陪伴"
          width={470}
          height={350}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-right"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,18,61,.42)_0%,rgba(10,18,61,.28)_56%,rgba(10,18,61,.22)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_90%_at_14%_28%,rgba(10,18,61,.68)_0%,rgba(10,18,61,.4)_45%,rgba(10,18,61,0)_100%)]" />
        <div className="hero-copy relative z-10 p-1">
          <h1 className="responsive-title font-semibold leading-tight tracking-normal">{greeting}</h1>
          <p className="responsive-body mt-2.5 leading-[1.62] text-white/90">{greetingDesc}</p>
        </div>
      </section>

      <GlassCard onClick={() => onNavigate("health-overview")} className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="responsive-section-title font-semibold">今日状态 ✨</h2>
          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-white/72">
            查看身心健康总览
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="status-grid">
          <StatusInline icon={<Moon className="h-4 w-4" />} label="睡眠" value={`${state.today.sleepHours}h`} progress={66} />
          <div className="status-divider h-12 bg-white/14" />
          <StatusInline icon={<Heart className="h-4 w-4" />} label="情绪" value={state.today.moodLabel} />
          <div className="status-divider h-12 bg-white/14" />
          <StatusInline icon={<Sparkles className="h-4 w-4" />} label="压力" value={`${state.today.stress}%`} progress={state.today.stress} progressColor="bg-[#8de67b]" />
        </div>
      </GlassCard>

      <GlassCard className="media-card relative overflow-hidden px-4 py-4">
        <Image
          src="/image2/home-ai-relax.png"
          alt="放松小悦"
          width={460}
          height={280}
          loading="eager"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right opacity-95"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,19,63,.36)_0%,rgba(12,19,63,.2)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(88%_90%_at_20%_34%,rgba(12,19,63,.74)_0%,rgba(12,19,63,.44)_48%,rgba(12,19,63,0)_100%)]" />
        <div className="relative z-10">
        <p className="responsive-section-title font-semibold">{mode === "night" ? "AI 今晚建议 ✨" : "AI 今日建议 ✨"}</p>
        <h3 className="media-copy mt-2 text-[18px] leading-[1.5] font-semibold">{primarySuggestion.title}</h3>
        <p className="media-copy mt-2 text-[13px] leading-6 text-white/82">{primarySuggestion.message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="primary-btn" onClick={() => onNavigate("ai-suggestion")}>开始放松</button>
          <button className="ghost-btn" onClick={() => onNavigate("companion", "companion")}>找小悦聊聊</button>
        </div>
        </div>
      </GlassCard>

      <GlassCard className="px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[18px] font-semibold">今日计划</p>
            <p className="mt-0.5 text-[12px] text-white/68">不用全部完成，照顾一点点自己就很好</p>
          </div>
          <span className="text-[13px] text-[#ffe19a]">
            {state.plans.filter((item) => item.done).length}/{state.plans.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {state.plans.map((plan) => (
            <button
              key={plan.id}
              className="plan-row w-full items-center gap-2 rounded-[12px] border border-white/10 bg-white/6 px-3 py-2 text-left"
              onClick={() => void onAction("toggle-plan", { planId: plan.id })}
            >
              {plan.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-white/58" />
              )}
              <span className={clsx("text-[13px] leading-5", plan.done && "text-white/58 line-through")}>{plan.title}</span>
              <span className="text-[11px] text-white/48">{plan.category}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard
        className="surprise-card relative overflow-hidden px-4 py-4"
        onClick={() => {
          void onAction("open-surprise");
          onNavigate("memories", "memories");
        }}
      >
        <div className="surprise-gift absolute h-12 w-12 rounded-[14px] bg-[radial-gradient(circle,#ffd79f_5%,#cf9bff_56%,#805bff_100%)] shadow-[0_0_24px_rgba(205,156,255,.58)]" />
        <div className="surprise-cta absolute h-8 rounded-full bg-[linear-gradient(135deg,#9f82ff,#d98fff)] px-4 py-1 text-[12px] font-semibold whitespace-nowrap">打开看看</div>
        <p className="text-[18px] font-semibold">今晚有一份小惊喜 ⭐</p>
        <p className="mt-2 text-[14px] text-white/75">一份特别的礼物已为你准备好</p>
      </GlassCard>

      <GlassCard className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/14 text-[#ffe09a]">
            <Volume2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">今日陪伴语音</p>
            <p className="truncate text-[12px] text-white/68">辛苦啦，今晚先把自己照顾好一点</p>
          </div>
          <button
            className="ghost-btn h-[36px] shrink-0 px-3"
            onClick={async () => {
              await onAction("recommendation-play", { title: "今日陪伴语音" });
              const result = await speak("辛苦啦，今晚先把自己照顾好一点。慢慢来，我会在这里陪你。", state.settings.voiceTone);
              if (result === "unavailable") {
                onNotice("云端少女音还没配置，我先不播放难听的系统音");
              }
            }}
          >
            <Play className="h-4 w-4 shrink-0" />
            <span className="voice-play-label">播放</span>
          </button>
        </div>
      </GlassCard>

      <GlassCard className="px-4 py-4">
        <div className="summary-header mb-3 flex items-center justify-between">
          <h2 className="responsive-section-title min-w-0 font-semibold">🌙 晚间回顾 · 今日总结</h2>
          <button className="text-[12px] text-white/70" onClick={() => onNavigate("memories", "memories")}>查看今日时光记</button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <SummaryCell label="心情" value={state.today.moodLabel} />
          <SummaryCell label="专注时长" value={`${Math.floor(state.today.focusMinutes / 60)}h ${state.today.focusMinutes % 60}m`} />
          <SummaryCell label="完成任务" value={`${state.today.completedTasks}/${state.today.totalTasks}`} />
        </div>
      </GlassCard>
    </div>
  );
}

function HealthOverviewScreen({ state, onNavigate }: { state: AppStatePayload; onNavigate: (screen: Screen, tab?: Tab) => void }) {
  const cards = [
    { key: "sleep", label: "睡眠关怀", route: "sleep-care", value: `${state.today.sleepHours}h`, dot: "良好" },
    { key: "emotion", label: "情绪价值", route: "emotion-value", value: state.today.moodLabel, dot: "平稳" },
    { key: "diet", label: "饮食健康", route: "diet-health", value: `${state.today.dietBalance}`, dot: "均衡" },
    { key: "exercise", label: "运动健康", route: "exercise-health", value: `${state.today.exerciseMinutes}分`, dot: "达标" },
    { key: "water", label: "喝水提醒", route: "water-reminder", value: `${state.today.waterCups}杯`, dot: "充足" },
    { key: "stress", label: "压力 / 能量", route: "stress-energy", value: `${state.today.stress}%`, dot: "适中" },
  ] as const;

  return (
    <div className="space-y-4">
      <SubHeader title="身心健康总览" source="来自首页 · 今日状态" onBack={() => onNavigate("home", "home")} />
      <GlassCard className="p-4">
        <div className="flex items-center gap-4">
          <div className="ring-score">{87}</div>
          <div>
            <p className="text-[23px] font-semibold">状态很棒，继续保持</p>
            <p className="mt-1 text-white/75">你在身心平衡的道路上稳步前行。</p>
          </div>
        </div>
      </GlassCard>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <GlassCard key={card.key} className="p-4" onClick={() => onNavigate(card.route)}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[16px] font-semibold">{card.label}</p>
              <ChevronRight className="h-4 w-4 text-white/70" />
            </div>
            <p className="text-[25px] font-semibold">{card.value}</p>
            <p className="text-[13px] text-emerald-300">• {card.dot}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function MetricScreen({
  state,
  category,
  onBack,
  onNavigate,
  onAction,
}: {
  state: AppStatePayload;
  category: "sleep" | "emotion" | "diet" | "exercise" | "water" | "stress";
  onBack: () => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
}) {
  const metric = state.metrics.find((item) => item.category === category) ?? state.metrics[0];
  const title =
    category === "sleep"
      ? "睡眠关怀"
      : category === "emotion"
        ? "情绪价值"
        : category === "diet"
          ? "饮食健康"
          : category === "exercise"
            ? "运动健康"
            : category === "water"
              ? "喝水提醒"
              : "压力 / 能量状态";
  const detail = metric.detail as {
    bedtime?: string;
    wakeTime?: string;
    deepSleep?: string;
    lightSleep?: string;
    efficiency?: string;
    trend?: number[];
    intake?: number;
    target?: number;
    burned?: number;
    water?: number;
    meals?: Array<[string, string, string, number]>;
    steps?: number;
    activeMinutes?: number;
    calories?: number;
    distance?: number;
    records?: Array<[string, string, string, string, string]>;
    progress?: number;
    pressure?: number;
    energy?: number;
    fatigue?: number;
    diary?: string;
  };

  return (
    <div className="space-y-4">
      <SubHeader title={title} source={`来自首页 · 今日状态 · 身心健康总览 · ${title}`} onBack={onBack} />
      <GlassCard className="p-4">
        <div className="flex gap-4">
          <div className="ring-score">{metric.score ?? 82}</div>
          <div>
            <p className="text-[26px] font-semibold">{metric.statusText}</p>
            <p className="mt-1 text-[14px] leading-6 text-white/78">{metric.aiComment}</p>
          </div>
        </div>
      </GlassCard>

      {category === "sleep" && (
        <GlassCard className="p-4">
          <p className="text-[18px] font-semibold">睡眠详情</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">入睡时间：{detail.bedtime ?? "22:30"}</div>
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">起床时间：{detail.wakeTime ?? "06:20"}</div>
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">深睡时长：{detail.deepSleep ?? "2小时"}</div>
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">浅睡时长：{detail.lightSleep ?? "3小时12分"}</div>
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">睡眠效率：{detail.efficiency ?? "90%"}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="primary-btn" onClick={() => onNavigate("relax-session")}>睡前放松</button>
            <button className="ghost-btn" onClick={() => onNavigate("story-player")}>晚安故事</button>
            <button className="ghost-btn" onClick={() => void onAction("play-music")}>白噪音</button>
          </div>
          <p className="mt-4 text-[16px] font-semibold">近 7 天睡眠趋势</p>
          <LineTrend values={detail.trend ?? [76, 82, 81, 78, 70, 84, 88]} />
        </GlassCard>
      )}

      {category === "emotion" && (
        <GlassCard className="p-4" onClick={() => onNavigate("emotion-diary")}>
          <p className="text-[18px] font-semibold">情绪日记</p>
          <p className="mt-2 text-[14px] leading-6 text-white/78">{String(detail.diary || "你今天有点累，但也很充实。")}</p>
          <button
            className="ghost-btn mt-3"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate("quick-record", "plus");
            }}
          >
            去记录此刻心情
          </button>
        </GlassCard>
      )}

      {category === "diet" && (
        <GlassCard className="p-4">
          <p className="text-[18px] font-semibold">今日饮食记录</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/16">
            <div className="h-full w-[71%] rounded-full bg-[#ba9bff]" />
          </div>
          <p className="mt-2 text-[13px] text-white/78">
            热量 {detail.intake ?? 1280} / {detail.target ?? 1800} kcal · 已消耗 {detail.burned ?? 1680} kcal
          </p>
          <div className="mt-3 space-y-2 text-[13px]">
            {(detail.meals ?? []).slice(0, 4).map((meal) => (
              <div key={`${meal[0]}-${meal[1]}`} className="rounded-[12px] border border-white/12 bg-white/7 px-3 py-2">
                {meal[0]} {meal[1]} · {meal[2]}（{meal[3]}kcal）
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="primary-btn" onClick={() => onNavigate("quick-record", "plus")}>拍照识餐</button>
            <button className="ghost-btn" onClick={() => void onAction("dinner-suggestion")}>晚餐建议</button>
            <button className="ghost-btn" onClick={() => void onAction("dinner-suggestion")}>外卖配餐</button>
          </div>
        </GlassCard>
      )}

      {category === "exercise" && (
        <GlassCard className="p-4">
          <p className="text-[18px] font-semibold">今日运动记录</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">步数：{detail.steps ?? state.today.steps}</div>
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">活动：{detail.activeMinutes ?? state.today.exerciseMinutes} 分钟</div>
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">热量：{detail.calories ?? 320} 千卡</div>
            <div className="rounded-[14px] border border-white/12 bg-white/7 p-3">距离：{detail.distance ?? 6.2} 公里</div>
          </div>
          <button className="primary-btn mt-3" onClick={() => void onAction("start-stretch")}>开始拉伸</button>
          <div className="mt-3 space-y-2 text-[13px]">
            {(detail.records ?? []).slice(0, 3).map((record) => (
              <div key={`${record[0]}-${record[1]}`} className="rounded-[12px] border border-white/12 bg-white/7 px-3 py-2">
                {record[0]} · {record[1]} · {record[2]} {record[3]} {record[4]}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[16px] font-semibold">近 7 天运动趋势</p>
          <LineTrend values={[52, 64, 58, 72, 68, 76, 86]} />
        </GlassCard>
      )}

      {category === "water" && (
        <GlassCard className="p-4">
          <p className="text-[18px] font-semibold">今日饮水进度</p>
          <p className="mt-1 text-[14px] text-white/78">{state.today.waterCups} / 8 杯</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/16">
            <div className="h-full rounded-full bg-[#7ec9ff]" style={{ width: `${Math.max(8, Math.min(100, (state.today.waterCups / 8) * 100))}%` }} />
          </div>
          <p className="mt-3 text-[13px] text-white/78">先喝一小口温水，身体会更轻松一点。我们慢慢来，不着急。</p>
          <div className="mt-3 flex gap-2">
            <button className="primary-btn" onClick={() => void onAction("increment-water")}>记录喝水 +1</button>
            <button className="ghost-btn" onClick={() => onNavigate("reminder-settings", "my")}>设置提醒</button>
          </div>
        </GlassCard>
      )}

      {category === "stress" && (
        <GlassCard className="p-4">
          <p className="text-[18px] font-semibold">今日压力 / 能量观察</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <SummaryCell label="压力" value={`${detail.pressure ?? state.today.stress}%`} />
            <SummaryCell label="能量" value={`${detail.energy ?? state.today.energy}%`} />
            <SummaryCell label="疲惫" value={`${detail.fatigue ?? 40}%`} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <SummaryCell label="情绪稳定" value="82%" />
            <SummaryCell label="恢复状态" value="良好" />
            <SummaryCell label="今日负荷" value="适中" />
          </div>
          <p className="mt-3 text-[13px] leading-6 text-white/78">{metric.aiComment}</p>
          <button className="primary-btn mt-3" onClick={() => onNavigate("relax-session")}>去做 5 分钟放松</button>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <p className="text-[18px] font-semibold">AI 建议</p>
        <p className="mt-2 text-[14px] text-white/78">{metric.aiComment || "今晚有一点疲惫，试试 5 分钟呼吸放松。"}</p>
        <div className="mt-3 flex gap-2">
          <button className="primary-btn" onClick={() => onNavigate("relax-session")}>开始放松</button>
          <button className="ghost-btn" onClick={() => onNavigate("companion", "companion")}>找小悦聊聊</button>
        </div>
      </GlassCard>
    </div>
  );
}

function AiSuggestionScreen({
  state,
  onBack,
  onNavigate,
  onAction,
}: {
  state: AppStatePayload;
  onBack: () => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
}) {
  const suggestion = state.suggestions.find((item) => item.isPrimary) ?? state.suggestions[0];
  return (
    <div className="space-y-4">
      <SubHeader title="AI 今日建议" source="来自首页 · AI 今日建议" onBack={onBack} />
      <GlassCard className="p-4">
        <p className="text-[26px] leading-[1.32] font-semibold">{suggestion.message}</p>
        <div className="mt-4 rounded-[22px] border border-white/20 bg-white/8 p-4">
          <p className="text-[13px] text-white/72">今日推荐 · 5 分钟温柔时光</p>
          <p className="mt-1 text-[24px] font-semibold">5 分钟呼吸放松</p>
          <p className="text-[14px] text-white/75">缓解紧张，放松身心，睡前更好眠</p>
          <button className="primary-btn mt-3 w-full justify-center" onClick={() => onNavigate("relax-session")}>开始放松</button>
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[18px] font-semibold">今晚还可以试试</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button className="tool-btn" onClick={() => onNavigate("story-player")}>晚安故事</button>
          <button className="tool-btn" onClick={() => void onAction("play-music")}>温和音乐</button>
          <button className="tool-btn" onClick={() => onNavigate("quick-record", "plus")}>写一句心情</button>
        </div>
      </GlassCard>
    </div>
  );
}

function CompanionScreen({
  state,
  onState,
  onNavigate,
  onAction,
  onNotice,
}: {
  state: AppStatePayload;
  onState: (state: AppStatePayload) => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
  onNotice: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [connectionTag, setConnectionTag] = useState("DeepSeek 已配置");
  const [recommendations, setRecommendations] = useState([
    ["你已经做得很好了 🌙", "每一个努力的你，都值得被看见", "03:21", "/image2/reco-voice-1.png"],
    ["深呼吸，慢慢来 💜", "放慢脚步，世界也会对你温柔一点", "02:45", "/image2/reco-voice-2.png"],
    ["给未来的自己一封信 ✨", "写下此刻的心愿，未来会感谢现在的自己", "04:12", "/image2/reco-voice-3.png"],
  ] as Array<[string, string, string, string]>);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const userInitial = state.user.name.trim().slice(0, 1) || "你";
  async function sendWithModel(content: string) {
    if (!content.trim() || thinking) return false;
    setThinking(true);
    setConnectionTag("DeepSeek 回复中…");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content.trim() }),
      });
      const payload = (await response.json()) as {
        state?: AppStatePayload;
        message?: { id: string; content: string } | string;
        error?: string;
        provider?: string;
        model?: string;
        reply?: string;
      };
      if (!response.ok || !payload.state) {
        setConnectionTag("DeepSeek 连接失败");
        onNotice(
          (typeof payload.message === "string" ? payload.message : undefined) ||
            payload.error ||
            "AI 连接失败，请稍后再试",
        );
        return false;
      }
      setConnectionTag(payload.provider && payload.model ? `${payload.provider} · ${payload.model}` : "DeepSeek 已连接");
      onState(payload.state);
      if (state.settings.voiceCompanionEnabled) {
        const replyText = payload.reply?.trim() || payload.state.chat[payload.state.chat.length - 1]?.content || "";
        const replyId =
          (typeof payload.message === "object" ? payload.message.id : undefined) ||
          payload.state.chat[payload.state.chat.length - 1]?.id ||
          "";
        const voiceResult = await speak(replyText, state.settings.voiceTone, (active) =>
          setSpeakingMessageId(active ? replyId : null),
        );
        if (voiceResult === "unavailable") {
          onNotice("云端少女音还没配置，我先不播放难听的系统音");
        }
      }
      return true;
    } finally {
      setThinking(false);
    }
  }

  async function send() {
    if (!text.trim() || thinking) return;
    const current = text.trim();
    setText("");
    const success = await sendWithModel(current);
    if (!success) {
      setText(current);
    }
  }

  async function toggleReplyVoice(message: AppStatePayload["chat"][number]) {
    if (speakingMessageId === message.id) {
      stopVoice();
      setSpeakingMessageId(null);
      return;
    }
    const result = await speak(message.content, state.settings.voiceTone, (active) =>
      setSpeakingMessageId(active ? message.id : null),
    );
    if (result === "unavailable") {
      onNotice("云端少女音还没配置，我先不播放难听的系统音");
    }
  }

  const chatPanel = (
    <GlassCard className="companion-chat-panel px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[18px] font-semibold">和小悦说说话</p>
          <p className="mt-0.5 text-[12px] text-white/68">小悦会认真听，也会慢慢回应你</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/16 bg-white/10 px-2 py-1 text-[11px] text-white/70">
          {thinking ? "正在回应" : connectionTag}
        </span>
      </div>
      <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
        {state.chat.slice(-6).map((message) => (
          <div
            key={message.id}
            className={clsx("flex items-end gap-2", message.role === "user" ? "justify-end" : "justify-start")}
          >
            {message.role !== "user" && (
              <div className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-white/25 bg-white/10">
                <AnimatedXiaoyue variant={state.settings.companionAvatar} size="xs" talking={speakingMessageId === message.id} />
                {speakingMessageId === message.id && (
                  <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-300 ring-2 ring-[#1f2b74]" />
                )}
              </div>
            )}
            <div
              className={clsx(
                "max-w-[76%] rounded-[18px] px-4 py-2.5 text-[14px] leading-6",
                message.role === "user" ? "chat-bubble-user bg-[#9474ff] text-white" : "chat-bubble-assistant bg-white/12",
              )}
            >
              <p className="mb-1 text-[11px] text-white/65">{message.role === "user" ? state.user.name : "小悦"}</p>
              <p>{message.content}</p>
              {message.role === "assistant" && (
                <button
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-white/62"
                  onClick={() => void toggleReplyVoice(message)}
                  aria-label={speakingMessageId === message.id ? "停止朗读小悦回复" : "朗读小悦回复"}
                >
                  {speakingMessageId === message.id ? <Pause className="h-3 w-3 fill-current" /> : <Volume2 className="h-3 w-3" />}
                  {speakingMessageId === message.id ? "停止" : "听小悦说"}
                </button>
              )}
            </div>
            {message.role === "user" && (
              <div className="user-avatar grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/25 bg-[#a78dff] text-[12px] font-semibold text-white">
                {userInitial}
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="flex items-end gap-2">
            <div className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-white/25 bg-white/10">
              <AnimatedXiaoyue variant={state.settings.companionAvatar} size="xs" talking />
            </div>
            <div className="companion-thinking-bubble max-w-[76%] rounded-[18px] bg-white/12 px-4 py-2.5">
              <p className="mb-1 text-[11px] text-white/65">小悦正在回答...</p>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/85" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/85 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/85 [animation-delay:240ms]" />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["今天有点累", "想被鼓励一下", "帮我慢下来"].map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border border-white/12 bg-white/8 px-2 py-2 text-[12px] text-white/72"
            onClick={() => setText(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => event.key === "Enter" && void send()}
          placeholder={thinking ? "小悦正在回应..." : "愿意说一点点也可以"}
          className="min-w-0 flex-1 rounded-full border border-white/18 bg-white/10 px-4 py-2.5 text-[14px] outline-none"
        />
        <button className="icon-btn h-11 w-11" aria-label="发送消息" onClick={() => void send()} disabled={thinking}>
          <Send className="h-4 w-4" />
        </button>
      </div>
    </GlassCard>
  );

  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center justify-between px-1">
        <button className="icon-btn" aria-label="返回" onClick={() => useAppStore.getState().setScreen("home", "home")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button className="icon-btn" aria-label="陪伴日程" onClick={() => onNavigate("memories", "memories")}>
          <CalendarDays className="h-5 w-5" />
        </button>
      </div>

      <section className="hero-card min-h-[236px]">
        <Image src="/image2/companion-hero.png" alt="陪伴小悦" width={396} height={320} className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,18,61,.42)_0%,rgba(10,18,61,.28)_56%,rgba(10,18,61,.22)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_90%_at_14%_28%,rgba(10,18,61,.68)_0%,rgba(10,18,61,.4)_45%,rgba(10,18,61,0)_100%)]" />
        <div className="relative z-10 max-w-[58%] p-1">
          <h1 className="text-[25px] font-semibold leading-tight">AI 陪伴⭐</h1>
          <p className="mt-2 text-[15px] leading-[1.45]">想对你说</p>
          <p className="mt-2 text-[14px] leading-7 text-white/88">24小时陪伴你，懂你每一种情绪</p>
          <span className="mt-2 inline-flex rounded-full border border-white/20 bg-white/12 px-2 py-0.5 text-[11px] text-white/85">
            {connectionTag}
          </span>
        </div>
      </section>

      {chatPanel}

      <GlassCard className="px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[radial-gradient(circle,#ffc7cf_0%,#b08fff_75%)] text-[#fff9f8]">
              <Heart className="h-6 w-6 fill-current" />
            </span>
            <div>
              <p className="text-[18px] font-semibold">有什么想和我聊聊的吗？</p>
              <p className="text-[13px] text-white/74">无论开心、难过，我都在这里听你说</p>
            </div>
          </div>
          <button
            className="primary-btn h-[38px] shrink-0 px-4"
            onClick={() => {
              inputRef.current?.focus();
            }}
          >
            开始聊天
          </button>
        </div>
      </GlassCard>

      <div className="grid grid-cols-3 gap-2">
        <button className="tool-btn" onClick={() => inputRef.current?.focus()}>
          倾诉一下
        </button>
        <button className="tool-btn" onClick={() => onNavigate("story-player")}>
          晚安故事
        </button>
        <button className="tool-btn" onClick={() => onNavigate("all-memories", "memories")}>
          陪伴记忆
        </button>
      </div>

      <GlassCard className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[18px] font-semibold">情绪陪伴</p>
          <button className="text-[13px] text-white/72" onClick={() => onNavigate("quick-record", "plus")}>更多</button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[
            ["开心", "想分享喜悦", "#866cf2", "😊"],
            ["难过", "需要安慰", "#b578c7", "🥺"],
            ["焦虑", "有点不安", "#7094d2", "😟"],
            ["疲惫", "想要放松", "#8f7fd7", "😴"],
            ["感恩", "心怀感激", "#b5856b", "🥰"],
          ].map(([title, subtitle, color, icon], index) => (
            <button
              key={title}
              className={clsx(
                "mood-chip rounded-[16px] border border-white/18 p-2 text-center text-white transition active:scale-[0.98]",
                index === 0 && "ring-2 ring-[#c7b4ff]/80",
              )}
              style={{ background: `linear-gradient(180deg, ${color}, rgba(73,61,133,0.8))` }}
              onClick={() => {
                void sendWithModel(`我现在感觉${title}，想找你聊聊。`);
              }}
            >
              <div className="mx-auto mb-1 grid h-9 w-9 place-items-center rounded-full bg-white/22 text-[20px]">{icon}</div>
              <p className="text-[15px] font-semibold">{title}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-white/85">{subtitle}</p>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[18px] font-semibold">暖心陪伴推荐</p>
          <button
            className="text-[13px] text-white/72"
            onClick={() => {
              setRecommendations((prev) => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev));
            }}
          >
            换一换
          </button>
        </div>
        <div className="space-y-2">
          {recommendations.map(([title, subtitle, duration, src]) => (
            <div key={title} className="flex items-center gap-3 rounded-[16px] border border-white/12 bg-white/8 p-3">
              <div className="relative h-16 w-24 overflow-hidden rounded-[10px] border border-white/10">
                <Image src={src} alt={title} fill sizes="96px" className="object-cover" />
                <span className="absolute bottom-1 right-1 rounded bg-black/45 px-1 text-[11px]">{duration}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[18px] font-semibold">{title}</p>
                <p className="truncate text-[13px] text-white/74">{subtitle}</p>
              </div>
              <button
                className="gradient-play-btn grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/20 bg-[linear-gradient(135deg,#ac95ff,#7e60ff)] text-white"
                onClick={async () => {
                  await onAction("recommendation-play", { title });
                  const result = await speak(`${title}。${subtitle}`, state.settings.voiceTone);
                  if (result === "unavailable") {
                    onNotice("云端少女音还没配置，我先不播放难听的系统音");
                  }
                }}
                aria-label={`播放陪伴语音：${title}`}
              >
                <Play className="h-4 w-4 fill-current" />
              </button>
            </div>
          ))}
        </div>
      </GlassCard>

    </div>
  );
}

function QuickRecordScreen({
  onState,
  onNavigate,
  onNotice,
}: {
  onState: (state: AppStatePayload) => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onNotice: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<MemoryItem | null>(null);
  const [category, setCategory] = useState<string>("talk_to_xiaoyue");
  const [photoHint, setPhotoHint] = useState("");
  const [recognizingPhoto, setRecognizingPhoto] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [foodDraft, setFoodDraft] = useState<RecognizedFoodDraft | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const categories = [
    { key: "mood", label: "心情", icon: Heart },
    { key: "diet", label: "饮食", icon: Leaf },
    { key: "sleep", label: "睡眠", icon: Moon },
    { key: "water", label: "喝水", icon: Droplets },
    { key: "exercise", label: "运动", icon: Activity },
    { key: "moment", label: "此刻", icon: Sparkles },
    { key: "talk_to_xiaoyue", label: "小悦", icon: Send },
  ] as const;

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  async function submit() {
    if (!text.trim()) return;
    const submittedText = text.trim();
    const response = await fetch("/api/quick-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: submittedText, category }),
    });
    const payload = (await response.json()) as { item?: MemoryItem; impact?: string; state?: AppStatePayload; error?: string };
    if (!response.ok || !payload.item || !payload.state) {
      onNotice(payload.error || "记录失败，请稍后重试");
      return;
    }
    setSaved(payload.item);
    setText("");
    let latestState = payload.state;

    if (category === "talk_to_xiaoyue") {
      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: submittedText }),
      });
      const chatPayload = (await chatResponse.json()) as { state?: AppStatePayload; message?: string; error?: string };
      if (chatResponse.ok && chatPayload.state) {
        latestState = chatPayload.state;
        onNotice("已记录并同步给小悦，陪伴回复已生成");
      } else {
        onNotice(chatPayload.message || chatPayload.error || "记录成功，但小悦暂时没有回复");
      }
    } else {
      onNotice(payload.impact || "已记录成功，稍后可在时光记查看");
    }

    onState(latestState);
  }

  async function recognizePhoto(file: File) {
    setRecognizingPhoto(true);
    try {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
      const preview = URL.createObjectURL(file);
      setPhotoPreviewUrl(preview);

      const form = new FormData();
      form.append("image", file);
      if (photoHint.trim()) {
        form.append("hint", photoHint.trim());
      }
      const response = await fetch("/api/food-recognition", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        state?: AppStatePayload;
        error?: string;
        provider?: string;
        usedFallback?: boolean;
        result?: RecognizedFoodDraft;
      };
      if (!response.ok || !payload.result) {
        onNotice(payload.error || "识别失败，请换个角度再拍一次");
        return;
      }

      setFoodDraft({
        ...payload.result,
        provider: payload.provider || payload.result.provider,
        usedFallback: Boolean(payload.usedFallback || payload.result.usedFallback),
      });
      const extra = payload.usedFallback ? "，当前为基础估算" : "";
      onNotice(`识别完成，请确认后写入饮食记录${extra}`);
    } finally {
      setRecognizingPhoto(false);
    }
  }

  function updateFoodDraft<K extends keyof RecognizedFoodDraft>(key: K, value: RecognizedFoodDraft[K]) {
    setFoodDraft((draft) => (draft ? { ...draft, [key]: value } : draft));
  }

  async function confirmFoodDraft() {
    if (!foodDraft || savingMeal) return;
    if (!foodDraft.foodName.trim() || !Number.isFinite(foodDraft.calories) || foodDraft.calories <= 0) {
      onNotice("请确认食物名称和热量");
      return;
    }
    setSavingMeal(true);
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm-meal",
          payload: {
            ...foodDraft,
            source: foodDraft.provider,
          },
        }),
      });
      const payload = (await response.json()) as ActionResponse;
      if (!response.ok || !payload.state) {
        onNotice(payload.error || "写入饮食记录失败");
        return;
      }
      onState(payload.state);
      setFoodDraft(null);
      setPhotoHint("");
      onNotice(payload.toast || "已写入饮食记录");
    } finally {
      setSavingMeal(false);
    }
  }

  async function onPickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await recognizePhoto(file);
    event.target.value = "";
  }

  return (
    <div className="space-y-4">
      <SubHeader title="快速记录" source="+ · 交给小悦整理" onBack={() => useAppStore.getState().setScreen("home", "home")} />
      <GlassCard className="p-4">
        <p className="text-[20px] font-semibold">你不用先整理好，说一句就可以</p>
        <p className="mt-2 text-[14px] text-white/72">小悦会自动整理到情绪、饮食、睡眠、小确幸或时光记。</p>
        <div className="mt-3 rounded-[18px] border border-white/14 bg-white/7 p-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white/12 text-[#ffe39e]">
              <Camera className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">拍照识别实物热量</p>
              <p className="mt-1 text-[12px] leading-5 text-white/72">
                支持打开摄像头拍照，也可以上传相册照片。识别后先确认，再写入饮食记录。
              </p>
            </div>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void onPickPhoto(event)}
          />
          <input
            ref={albumInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void onPickPhoto(event)}
          />
          <input
            value={photoHint}
            onChange={(event) => setPhotoHint(event.target.value)}
            placeholder="可选：补充菜名/分量，例如半碗米饭+鸡胸肉"
            className="mt-3 w-full rounded-full border border-white/16 bg-white/8 px-3 py-2.5 text-[12px] outline-none"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="primary-btn h-[36px] px-3"
              onClick={() => cameraInputRef.current?.click()}
              disabled={recognizingPhoto}
            >
              <Camera className="h-4 w-4" />
              {recognizingPhoto ? "识别中…" : "拍照识别"}
            </button>
            <button
              className="ghost-btn h-[36px] px-3"
              onClick={() => albumInputRef.current?.click()}
              disabled={recognizingPhoto}
            >
              <Upload className="h-4 w-4" />
              上传照片
            </button>
          </div>
          {photoPreviewUrl && (
            <div className="mt-3 overflow-hidden rounded-[14px] border border-white/14">
              <Image
                src={photoPreviewUrl}
                alt="食物预览"
                width={640}
                height={360}
                unoptimized
                className="h-32 w-full object-cover"
              />
            </div>
          )}
          {foodDraft && (
            <div className="mt-3 rounded-[16px] border border-white/14 bg-white/9 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-white/66">识别结果 · {foodDraft.provider || "AI 估算"}</p>
                  <input
                    value={foodDraft.foodName}
                    onChange={(event) => updateFoodDraft("foodName", event.target.value)}
                    className="mt-1 w-full rounded-[12px] border border-white/14 bg-white/8 px-3 py-2 text-[16px] font-semibold outline-none"
                  />
                </div>
                <span className="shrink-0 rounded-full bg-[#ffe39e]/18 px-2 py-1 text-[11px] text-[#ffe39e]">
                  {Math.round(foodDraft.confidence * 100)}%
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NutritionInput label="热量 kcal" value={foodDraft.calories} onChange={(value) => updateFoodDraft("calories", value)} />
                <NutritionInput label="碳水 g" value={foodDraft.carbs} onChange={(value) => updateFoodDraft("carbs", value)} />
                <NutritionInput label="蛋白质 g" value={foodDraft.protein} onChange={(value) => updateFoodDraft("protein", value)} />
                <NutritionInput label="脂肪 g" value={foodDraft.fat} onChange={(value) => updateFoodDraft("fat", value)} />
                <NutritionInput label="膳食纤维 g" value={foodDraft.fiber} onChange={(value) => updateFoodDraft("fiber", value)} />
                <label className="block">
                  <span className="text-[11px] text-white/62">餐别</span>
                  <select
                    value={foodDraft.mealType || "加餐"}
                    onChange={(event) => updateFoodDraft("mealType", event.target.value as RecognizedFoodDraft["mealType"])}
                    className="mt-1 w-full rounded-[12px] border border-white/14 bg-white/8 px-2 py-2 text-[13px] outline-none"
                  >
                    {["早餐", "午餐", "晚餐", "加餐"].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-2 block">
                <span className="text-[11px] text-white/62">维生素 / 矿物质亮点</span>
                <input
                  value={foodDraft.vitamins}
                  onChange={(event) => updateFoodDraft("vitamins", event.target.value)}
                  className="mt-1 w-full rounded-[12px] border border-white/14 bg-white/8 px-3 py-2 text-[13px] outline-none"
                />
              </label>
              <label className="mt-2 block">
                <span className="text-[11px] text-white/62">营养说明</span>
                <textarea
                  value={foodDraft.note || ""}
                  onChange={(event) => updateFoodDraft("note", event.target.value)}
                  className="mt-1 min-h-16 w-full rounded-[12px] border border-white/14 bg-white/8 px-3 py-2 text-[13px] outline-none"
                />
              </label>
              {foodDraft.usedFallback && (
                <p className="mt-2 rounded-[12px] border border-amber-200/25 bg-amber-200/12 px-3 py-2 text-[12px] leading-5 text-amber-100">
                  当前视觉模型未配置，结果为基础估算。你可以先手动修正，再写入记录。
                </p>
              )}
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <button className="primary-btn h-[38px] justify-center" onClick={() => void confirmFoodDraft()} disabled={savingMeal}>
                  <CheckCircle2 className="h-4 w-4" />
                  {savingMeal ? "写入中…" : "确认写入饮食记录"}
                </button>
                <button className="ghost-btn h-[38px] px-3" onClick={() => setFoodDraft(null)}>
                  重拍
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {categories.map((item) => {
            const Icon = item.icon;
            const active = category === item.key;
            return (
              <button
                key={item.key}
                className={clsx(
                  "flex min-h-[42px] items-center gap-1.5 rounded-[13px] border px-2 py-2 text-left text-[12px] leading-tight",
                  active ? "border-[#c0adff] bg-[#a58bff]/22" : "border-white/14 bg-white/7",
                )}
                onClick={() => setCategory(item.key)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#ffe39e]" />
                <span className="min-w-0">{item.label}</span>
              </button>
            );
          })}
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="比如：今天同事夸我了 / 晚饭吃了炸鸡 / 今晚又睡不着"
          className="mt-3 min-h-24 w-full rounded-[18px] border border-white/18 bg-white/8 p-3 text-[14px] outline-none"
        />
        <button className="primary-btn mt-3 w-full justify-center" onClick={() => void submit()}>交给小悦记录</button>
      </GlassCard>
      {saved && (
        <GlassCard className="p-4 text-emerald-200">
          <p>已为你记录到「{saved.title}」</p>
          <button className="ghost-btn mt-3" onClick={() => onNavigate("memories", "memories")}>去时光记查看</button>
        </GlassCard>
      )}
    </div>
  );
}

function NutritionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-white/62">{label}</span>
      <input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-[12px] border border-white/14 bg-white/8 px-3 py-2 text-[13px] outline-none"
      />
    </label>
  );
}

function MemoriesScreen({
  memories,
  onNavigate,
  onAction,
}: {
  memories: MemoryItem[];
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
}) {
  const todayMemories = memories.filter((item) => item.time.includes("今天") || item.time.includes("刚刚"));
  const todayCount = Math.max(1, todayMemories.length);
  const streakDays = Math.max(1, Math.min(99, Math.ceil(memories.length / 2)));
  const glowValue = 680 + memories.length * 8;

  return (
    <div className="space-y-3 pb-2">
      <section className="hero-card min-h-[286px]">
        <Image src="/image2/memories-hero.png" alt="时光记小悦" width={432} height={300} className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,18,61,.42)_0%,rgba(10,18,61,.28)_56%,rgba(10,18,61,.22)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_90%_at_14%_28%,rgba(10,18,61,.68)_0%,rgba(10,18,61,.4)_45%,rgba(10,18,61,0)_100%)]" />
        <div className="relative z-10 max-w-[55%] p-1">
          <h1 className="text-[25px] font-semibold leading-tight">时光记⭐</h1>
          <p className="mt-2 text-[15px] leading-[1.55]">记录生活，收藏每一个值得被记住的瞬间</p>
        </div>
      </section>

      <GlassCard className="px-4 py-4">
        <h2 className="text-[18px] font-semibold">今晚留下了 <span className="text-[#ffd879]">{todayCount}</span> 个值得被记住的瞬间</h2>
        <p className="mt-1 text-[14px] text-white/78">你的时光正在发光 ✨</p>
        <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-4">
          <div>
            <p className="text-[13px] text-white/70">连续记录</p>
            <p className="text-[32px] leading-none font-semibold">{streakDays}</p>
            <p className="text-[13px] text-white/70">天</p>
          </div>
          <div>
            <p className="text-[13px] text-white/70">时光点亮值</p>
            <p className="text-[32px] leading-none font-semibold">{glowValue}</p>
            <p className="text-[13px] text-white/70">你今天有意识地照顾了自己</p>
          </div>
          <button className="primary-btn" onClick={() => void onAction("reflect-today")}>回顾今天</button>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-2 min-[410px]:grid-cols-3">
        {[
          ["日记", "记录每一天", "📔", "memory-journal"],
          ["回忆", "珍贵回忆相册", "🖼️", "memory-gallery"],
          ["小确幸", "收集生活的小幸福", "✨", "small-happiness"],
          ["AI 回忆录", "AI 自动生成温柔回忆", "🔮", "ai-memoir"],
          ["人生时间轴", "按时间查看成长轨迹", "⌛", "life-timeline"],
        ].map(([title, subtitle, icon, route]) => (
          <GlassCard
            key={title}
            className="min-h-[116px] px-3 py-3 text-left"
            onClick={() => onNavigate(route as Screen, "memories")}
          >
            <p className="text-[26px] leading-none">{icon}</p>
            <p className="mt-2 text-[16px] font-semibold">{title}</p>
            <p className="mt-1 text-[12px] leading-5 text-white/72">{subtitle}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[18px] font-semibold">最近的时光 ⭐</p>
          <button className="text-[13px] text-white/72" onClick={() => onNavigate("all-memories", "memories")}>全部记录</button>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
          {memories.slice(0, 3).map((item, index) => (
            <div key={item.id} className="overflow-hidden rounded-[14px] border border-white/12 bg-white/8">
              <div className="relative h-28">
                <Image
                  src={index === 0 ? "/image2/thumb-nightwalk.png" : index === 1 ? "/image2/thumb-cake.png" : "/image2/thumb-sunset.png"}
                  alt={item.title}
                  fill
                  sizes="190px"
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,15,55,0)_40%,rgba(8,15,55,.35)_100%)]" />
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-[14px] leading-6">{item.content}</p>
                <p className="mt-2 text-[12px] text-pink-200">❤ {item.tags[0] ?? "时光"} · {item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="relative overflow-hidden px-4 py-4">
        <Image src="/image2/reco-voice-2.png" alt="整理回忆的小悦" width={396} height={320} className="pointer-events-none absolute left-0 bottom-[-42px] h-auto w-[34%] opacity-95" />
        <div className="ml-[30%] min-w-0">
          <p className="text-[24px] font-semibold">想让我帮你整理今天的回忆吗？</p>
          <p className="mt-1 text-[13px] text-white/74">我会为你挑选重要瞬间，写成温暖的篇章 ✨</p>
          <div className="mt-3 flex gap-2">
            <button className="primary-btn" onClick={() => onNavigate("ai-memoir", "memories")}>开始整理</button>
            <button className="ghost-btn" onClick={() => onNavigate("memory-journal", "memories")}>写一篇日记</button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function EmotionDiaryScreen({
  state,
  onBack,
  onNavigate,
  onAction,
}: {
  state: AppStatePayload;
  onBack: () => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
}) {
  const emotion = state.metrics.find((item) => item.category === "emotion");
  const trend = (emotion?.detail.trend as number[]) ?? [35, 58, 62, 42, 64, 68, 86];
  const [selectedMood, setSelectedMood] = useState("开心");
  return (
    <div className="space-y-4">
      <SubHeader title="情绪日记" source="记录情绪，理解自己，拥抱更好的你" onBack={onBack} />
      <GlassCard className="p-4">
        <p className="text-[18px] font-semibold">此刻心情</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["开心", "平静", "放松", "焦虑", "难过", "疲惫"].map((mood) => (
            <button
              key={mood}
              className={clsx(
                "rounded-[16px] border p-3 text-[14px]",
                selectedMood === mood ? "border-[#c2b3ff] bg-[#a88cff]/24" : "border-white/14 bg-white/8",
              )}
              onClick={() => {
                setSelectedMood(mood);
                void onAction("emotion-support", { mood });
              }}
            >
              {mood}
            </button>
          ))}
        </div>
        <button className="primary-btn mt-3" onClick={() => onNavigate("quick-record", "plus")}>写一句此刻心情</button>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[18px] font-semibold">近 7 天情绪趋势</p>
        <LineTrend values={trend} />
      </GlassCard>
    </div>
  );
}

type MemoryVariant = "journal" | "gallery" | "happiness" | "all";

const memoryImages = ["/image2/thumb-nightwalk.png", "/image2/thumb-cake.png", "/image2/thumb-sunset.png"];

function memoryVariantMeta(variant: MemoryVariant) {
  if (variant === "journal") {
    return {
      title: "日记",
      source: "来自时光记 · 日记",
      intro: "不用写长篇。你留下的一句话，也会成为值得记住的一天。",
      empty: "还没有日记。先写下一句今天最想留下的话。",
    };
  }
  if (variant === "gallery") {
    return {
      title: "回忆",
      source: "来自时光记 · 回忆相册",
      intro: "把零散的生活片段收好，慢慢看见自己走过的路。",
      empty: "还没有回忆片段。下一次记录，会从这里开始发光。",
    };
  }
  if (variant === "happiness") {
    return {
      title: "小确幸",
      source: "来自时光记 · 小确幸",
      intro: "再忙的生活里，也值得为一点点温暖留一个位置。",
      empty: "今天还没有小确幸。哪怕只是一杯喜欢的饮料，也可以记下来。",
    };
  }
  return {
    title: "全部时光",
    source: "来自时光记 · 全部记录",
    intro: "这里收着你认真生活的证据。它们不必宏大，也都有意义。",
    empty: "还没有记录。先从一句此刻的感受开始。",
  };
}

function filteredMemories(memories: MemoryItem[], variant: MemoryVariant) {
  if (variant === "journal") {
    return memories.filter((item) => item.type === "emotion" || item.type === "ai_summary");
  }
  if (variant === "happiness") {
    return memories.filter((item) => item.type === "small_happiness");
  }
  return memories;
}

function MemoryCollectionScreen({
  state,
  variant,
  onBack,
  onNavigate,
}: {
  state: AppStatePayload;
  variant: MemoryVariant;
  onBack: () => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
}) {
  const meta = memoryVariantMeta(variant);
  const items = filteredMemories(state.memories, variant);
  return (
    <div className="space-y-4">
      <SubHeader title={meta.title} source={meta.source} onBack={onBack} />
      <GlassCard className="p-4">
        <p className="text-[16px] leading-7 text-white/86">{meta.intro}</p>
        <button className="primary-btn mt-3" onClick={() => onNavigate("quick-record", "plus")}>
          <NotebookPen className="h-4 w-4" />
          记录此刻
        </button>
      </GlassCard>
      {variant === "gallery" ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, index) => (
            <GlassCard key={item.id} className="overflow-hidden">
              <div className="relative h-28">
                <Image src={memoryImages[index % memoryImages.length]} alt={item.title} fill sizes="(max-width: 430px) 46vw, 200px" className="object-cover" />
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-[14px] leading-5 font-semibold">{item.title}</p>
                <p className="mt-1 text-[12px] text-white/62">{item.time}</p>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <MemoryRecordCard key={item.id} item={item} image={memoryImages[index % memoryImages.length]} />
          ))}
        </div>
      )}
      {!items.length && (
        <GlassCard className="p-4 text-[14px] leading-6 text-white/72">{meta.empty}</GlassCard>
      )}
    </div>
  );
}

function MemoryRecordCard({ item, image }: { item: MemoryItem; image?: string }) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="flex gap-3 p-3">
        {image && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[12px]">
            <Image src={image} alt={item.title} fill sizes="80px" className="object-cover" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="line-clamp-1 text-[15px] font-semibold">{item.title}</p>
            <span className="shrink-0 text-[11px] text-[#ffe09a]">{item.time}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-white/74">{item.content}</p>
          <p className="mt-1.5 text-[11px] text-pink-200">{item.tags.slice(0, 3).join(" · ") || "生活记录"}</p>
        </div>
      </div>
    </GlassCard>
  );
}

function AiMemoirScreen({
  state,
  onBack,
  onAction,
}: {
  state: AppStatePayload;
  onBack: () => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
}) {
  const summaries = state.memories.filter((item) => item.type === "ai_summary");
  return (
    <div className="space-y-4">
      <SubHeader title="AI 回忆录" source="来自时光记 · AI 回忆录" onBack={onBack} />
      <GlassCard className="relative overflow-hidden p-4">
        <Sparkles className="absolute right-4 top-4 h-10 w-10 text-[#ffe09a]/80" />
        <p className="max-w-[78%] text-[20px] font-semibold">把散落的生活，整理成值得被记住的故事</p>
        <p className="mt-2 max-w-[85%] text-[13px] leading-6 text-white/72">
          小悦会从你的情绪、饮食、运动、睡眠和小幸福里，挑出今天最重要的片段。
        </p>
        <button className="primary-btn mt-3" onClick={() => void onAction("reflect-today")}>
          <Sparkles className="h-4 w-4" />
          生成今日回顾
        </button>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[17px] font-semibold">已生成的篇章</p>
        <div className="mt-3 space-y-2">
          {summaries.map((item) => (
            <div key={item.id} className="rounded-[14px] border border-white/12 bg-white/7 p-3">
              <p className="text-[14px] font-semibold">{item.title}</p>
              <p className="mt-1 text-[13px] leading-6 text-white/74">{item.content}</p>
              <p className="mt-1 text-[11px] text-[#ffe09a]">{item.time}</p>
            </div>
          ))}
          {!summaries.length && <p className="text-[13px] text-white/62">还没有篇章，先生成一次今日回顾吧。</p>}
        </div>
      </GlassCard>
    </div>
  );
}

function LifeTimelineScreen({ memories, onBack }: { memories: MemoryItem[]; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <SubHeader title="人生时间轴" source="来自时光记 · 人生时间轴" onBack={onBack} />
      <GlassCard className="p-4">
        <p className="text-[16px] leading-7 text-white/84">不是流水账，是你一步一步走过来的生活轨迹。</p>
      </GlassCard>
      <div className="relative ml-3 space-y-3 border-l border-[#b8a5ff]/38 pl-5">
        {memories.map((item) => (
          <div key={item.id} className="relative">
            <span className="absolute -left-[27px] top-4 grid h-3 w-3 place-items-center rounded-full bg-[#ffe09a] shadow-[0_0_12px_rgba(255,224,154,.75)]" />
            <GlassCard className="p-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[#ffe09a]" />
                <span className="text-[12px] text-white/62">{item.time}</span>
              </div>
              <p className="mt-1 text-[15px] font-semibold">{item.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-white/72">{item.content}</p>
            </GlassCard>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelaxSessionScreen({
  onBack,
  onNavigate,
  onAction,
}: {
  onBack: () => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
}) {
  const duration = 300;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => {
        if (value >= duration - 1) {
          setRunning(false);
          return duration;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const breathStep = elapsed % 12;
  const cue = breathStep < 4 ? "慢慢吸气" : breathStep < 6 ? "停留一下" : "缓缓呼气";
  const remaining = duration - elapsed;
  const progress = Math.round((elapsed / duration) * 100);

  function start() {
    setRunning(true);
    if (!logged) {
      setLogged(true);
      void onAction("start-relax");
    }
  }

  return (
    <div className="space-y-4">
      <SubHeader title="5 分钟呼吸放松" source="来自 AI 今日建议 · 睡前恢复" onBack={onBack} />
      <GlassCard className="p-4 text-center">
        <p className="text-[14px] text-white/72">不用努力做好，只要跟着节奏慢一点</p>
        <div className="my-6 grid place-items-center">
          <motion.div
            className="grid h-48 w-48 place-items-center rounded-full border border-white/24 bg-[radial-gradient(circle,#ffe2a4_0%,#c49cff_34%,#755eff_72%,rgba(72,67,180,.28)_100%)] shadow-[0_0_60px_rgba(170,130,255,.62)]"
            animate={{ scale: running ? [0.82, 1.1, 1.1, 0.82] : 0.9, opacity: running ? [0.72, 1, 1, 0.72] : 0.86 }}
            transition={running ? { duration: 12, repeat: Infinity, times: [0, 0.33, 0.5, 1], ease: "easeInOut" } : { duration: 0.3 }}
          >
            <div>
              <p className="text-[22px] font-semibold">{cue}</p>
              <p className="mt-1 text-[14px] text-white/76">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>
            </div>
          </motion.div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/14">
          <div className="h-full rounded-full bg-[#ffe09a]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <button className="primary-btn" onClick={running ? () => setRunning(false) : start}>
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "暂停一下" : elapsed ? "继续放松" : "开始放松"}
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              setRunning(false);
              setElapsed(0);
            }}
          >
            重新开始
          </button>
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[15px] font-semibold">结束后不必立刻做事</p>
        <p className="mt-1 text-[13px] leading-6 text-white/72">喝一小口水，或者和小悦说说此刻有没有轻松一点。</p>
        <button className="ghost-btn mt-3" onClick={() => onNavigate("companion", "companion")}>找小悦聊聊</button>
      </GlassCard>
    </div>
  );
}

function StoryPlayerScreen({
  state,
  onBack,
  onAction,
  onNotice,
}: {
  state: AppStatePayload;
  onBack: () => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
  onNotice: (message: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [logged, setLogged] = useState(false);
  const story =
    "今晚，窗外的灯一点点安静下来。小悦把一颗温暖的小星星放在你的枕边。今天没有做完的事情，可以先留给明天。你已经走了很远，现在只需要慢慢呼吸，让肩膀松下来。星星会替你守着夜晚，直到你安心睡着。";

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, []);

  async function toggleStory() {
    if (playing) {
      stopVoice();
      setPlaying(false);
      return;
    }
    if (!logged) {
      setLogged(true);
      await onAction("play-story");
    }
    const result = await speak(story, state.settings.voiceTone, setPlaying);
    if (result === "unavailable") {
      onNotice("云端少女音还没配置，我先不播放难听的系统音");
    }
  }

  return (
    <div className="space-y-4">
      <SubHeader title="晚安故事" source="来自睡眠关怀 · 小悦陪你入睡" onBack={onBack} />
      <GlassCard className="relative overflow-hidden p-4">
        <Image src="/image2/reco-voice-3.png" alt="晚安故事小悦" width={396} height={320} className="absolute right-[-24px] top-[-12px] h-40 w-40 rounded-full object-cover opacity-82" />
        <div className="relative max-w-[64%]">
          <BookOpen className="h-7 w-7 text-[#ffe09a]" />
          <p className="mt-2 text-[22px] font-semibold">枕边的小星星</p>
          <p className="mt-1 text-[13px] text-white/72">约 3 分钟 · 温柔少女音</p>
        </div>
        <button className="primary-btn relative mt-4" onClick={() => void toggleStory()}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "暂停故事" : "播放故事"}
        </button>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[16px] font-semibold">今晚的故事</p>
        <p className="mt-2 text-[14px] leading-7 text-white/78">{story}</p>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[15px] font-semibold">搭配一点安静背景</p>
        <button
          className="ghost-btn mt-3"
          onClick={() => {
            void onAction("play-music");
            onNotice("已开启温和背景音乐");
          }}
        >
          <Volume2 className="h-4 w-4" />
          开启温和音乐
        </button>
      </GlassCard>
    </div>
  );
}

function DigitalAssetsScreen({ state, onBack }: { state: AppStatePayload; onBack: () => void }) {
  const happinessCount = state.memories.filter((item) => item.type === "small_happiness").length;
  const summaries = state.memories.filter((item) => item.type === "ai_summary").length;
  const healthAverage = Math.round(
    state.metrics.reduce((sum, item) => sum + (item.score ?? 0), 0) / Math.max(state.metrics.length, 1),
  );
  const items = [
    ["生活记录", String(state.memories.length), "你认真留下的每一个片段"],
    ["小确幸", String(happinessCount), "那些没有被忙碌盖住的微小温暖"],
    ["AI 回忆录", String(summaries), "小悦为你整理好的生活篇章"],
    ["陪伴对话", String(state.chat.length), "你愿意交给小悦的心事与回应"],
    ["健康平衡", `${healthAverage}`, "来自睡眠、情绪、饮食与身体恢复"],
    ["连续计划", `${state.plans.filter((item) => item.done).length}/${state.plans.length}`, "今天已经完成的自我照顾"],
  ];
  return (
    <div className="space-y-4">
      <SubHeader title="人生数字资产" source="来自我的 · 人生数字资产" onBack={onBack} />
      <GlassCard className="p-4">
        <Database className="h-8 w-8 text-[#ffe09a]" />
        <p className="mt-2 text-[20px] font-semibold">你的生活会一点点积累成只属于你的数字资产</p>
        <p className="mt-1 text-[13px] leading-6 text-white/72">不是冷冰冰的数据，是小悦理解你、陪伴你、帮你整理人生故事的基础。</p>
      </GlassCard>
      <div className="grid grid-cols-2 gap-3">
        {items.map(([title, value, desc]) => (
          <GlassCard key={title} className="p-3">
            <p className="text-[13px] text-white/68">{title}</p>
            <p className="mt-1 text-[26px] font-semibold text-[#ffe09a]">{value}</p>
            <p className="mt-1 text-[12px] leading-5 text-white/62">{desc}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function ProfileSettingsScreen({
  state,
  onState,
  onBack,
  onNotice,
}: {
  state: AppStatePayload;
  onState: (state: AppStatePayload) => void;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const [name, setName] = useState(state.user.name);
  const [saving, setSaving] = useState(false);

  async function save() {
    const normalized = name.trim();
    if (!normalized) {
      onNotice("昵称不能为空");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalized }),
      });
      const payload = (await response.json()) as { state?: AppStatePayload; error?: string };
      if (!response.ok || !payload.state) {
        onNotice(payload.error || "资料保存失败");
        return;
      }
      onState(payload.state);
      onNotice("个人资料已更新");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SubHeader title="个人信息" source="来自我的 · 个人信息" onBack={onBack} />
      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-[20px] border border-white/20 bg-white/10">
            <AnimatedXiaoyue variant={state.settings.companionAvatar} size="md" talking />
          </div>
          <div>
            <p className="text-[18px] font-semibold">{state.user.name}</p>
            <p className="text-[13px] text-white/68">小悦会记住你的生活节奏与偏好</p>
          </div>
        </div>
        <button className="ghost-btn mt-3" onClick={() => onNotice("头像上传入口已保留，将在账号服务接入后同步云端")}>
          <Camera className="h-4 w-4" />
          更换头像
        </button>
      </GlassCard>
      <GlassCard className="space-y-3 p-4">
        <label className="block">
          <span className="text-[13px] text-white/68">昵称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-[14px] border border-white/16 bg-white/8 px-3 py-2.5 text-[15px] outline-none" />
        </label>
        <label className="block">
          <span className="text-[13px] text-white/68">陪伴者</span>
          <input value={state.user.companionName} readOnly className="mt-1 w-full rounded-[14px] border border-white/12 bg-white/6 px-3 py-2.5 text-[15px] text-white/72 outline-none" />
        </label>
        <button className="primary-btn" onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存资料"}</button>
      </GlassCard>
    </div>
  );
}

function HealthArchiveScreen({
  state,
  onBack,
  onNavigate,
}: {
  state: AppStatePayload;
  onBack: () => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
}) {
  const routes: Record<string, Screen> = {
    sleep: "sleep-care",
    emotion: "emotion-value",
    diet: "diet-health",
    exercise: "exercise-health",
    water: "water-reminder",
    stress: "stress-energy",
  };
  const labels: Record<string, string> = {
    sleep: "睡眠恢复",
    emotion: "情绪状态",
    diet: "饮食平衡",
    exercise: "运动活力",
    water: "饮水进度",
    stress: "压力能量",
  };
  const average = Math.round(
    state.metrics.reduce((sum, item) => sum + (item.score ?? 0), 0) / Math.max(state.metrics.length, 1),
  );
  return (
    <div className="space-y-4">
      <SubHeader title="健康档案" source="来自我的 · 健康档案" onBack={onBack} />
      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <ChartNoAxesCombined className="h-8 w-8 text-[#ffe09a]" />
          <div>
            <p className="text-[20px] font-semibold">本周身心平衡 {average} 分</p>
            <p className="text-[13px] text-white/68">轻健康观察，不制造焦虑，只帮你看见恢复节奏。</p>
          </div>
        </div>
      </GlassCard>
      <div className="grid grid-cols-2 gap-3">
        {state.metrics.map((metric) => (
          <GlassCard key={metric.id} className="p-3" onClick={() => onNavigate(routes[metric.category], "home")}>
            <p className="text-[14px] font-semibold">{labels[metric.category]}</p>
            <p className="mt-1 text-[25px] font-semibold text-[#ffe09a]">{metric.score ?? "-"}</p>
            <p className="mt-1 text-[12px] text-white/66">{metric.statusText}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function GeneralSettingsScreen({
  state,
  onBack,
  onNavigate,
  onAction,
}: {
  state: AppStatePayload;
  onBack: () => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
}) {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const items = [
    ["通知 / 提醒", state.settings.remindersEnabled ? `${state.settings.reminderTime} 已开启` : "已关闭", "reminder-settings", Volume2],
    ["回复自动朗读", state.settings.voiceCompanionEnabled ? "已开启" : "默认静音", "voice-settings", Volume2],
  ] as const;

  useEffect(() => {
    let alive = true;
    async function loadCapabilities() {
      const response = await fetch("/api/integration-status", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const payload = (await response.json()) as { capabilities?: Capability[] };
      if (alive && payload.capabilities) {
        setCapabilities(payload.capabilities);
      }
    }
    void loadCapabilities();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <SubHeader title="设置" source="来自我的 · 设置" onBack={onBack} />
      {items.map(([title, status, route, Icon]) => (
        <GlassCard key={title} className="p-4" onClick={() => onNavigate(route, "my")}>
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-[#ffe09a]" />
            <div className="flex-1">
              <p className="text-[16px] font-semibold">{title}</p>
              <p className="text-[12px] text-white/62">{status}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/62" />
          </div>
        </GlassCard>
      ))}
      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-[#ffe09a]" />
          <div className="flex-1">
            <p className="text-[16px] font-semibold">数据保存与同步</p>
            <p className="text-[12px] text-white/62">本地数据库已保存 · 云同步待接入</p>
          </div>
          <button className="ghost-btn" onClick={() => void onAction("data-sync")}>检查状态</button>
        </div>
        <a className="ghost-btn mt-3 w-full" href="/api/data-export" download>
          <Download className="mr-2 h-4 w-4" />
          导出完整本地备份
        </a>
      </GlassCard>
      <GlassCard className="p-4">
        <div className="flex gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <p className="text-[16px] font-semibold">数据与隐私</p>
            <p className="mt-1 text-[13px] leading-6 text-white/68">生活记录、健康状态与陪伴对话均通过数据库保存。正式账号体系接入后，将支持加密云同步与多端恢复。</p>
          </div>
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <div className="flex gap-3">
          <Database className="h-5 w-5 shrink-0 text-[#ffe09a]" />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">能力接入状态</p>
            <p className="mt-1 text-[12px] leading-5 text-white/62">这里展示当前真实可用能力，不用模拟状态掩盖外部服务缺口。</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {capabilities.length ? (
            capabilities.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-[12px] border border-white/12 bg-white/7 px-3 py-2">
                <div>
                  <p className="text-[13px] font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-white/62">{item.detail}</p>
                </div>
                <span
                  className={clsx(
                    "shrink-0 rounded-full px-2 py-1 text-[10px]",
                    item.status === "ready"
                      ? "bg-emerald-400/16 text-emerald-200"
                      : item.status === "limited"
                        ? "bg-amber-300/16 text-amber-100"
                        : "bg-white/10 text-white/62",
                  )}
                >
                  {item.status === "ready" ? "已接入" : item.status === "limited" ? "基础版" : "待接入"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-white/62">正在读取真实接入状态…</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function MyScreen({
  state,
  authUser,
  onState,
  onAction,
  onNotice,
  onNavigate,
  onLogout,
}: {
  state: AppStatePayload;
  authUser: AuthUser;
  onState: (state: AppStatePayload) => void;
  onAction: (action: ActionName, payload?: Record<string, unknown>) => Promise<ActionResponse | null>;
  onNotice: (message: string) => void;
  onNavigate: (screen: Screen, tab?: Tab) => void;
  onLogout: () => Promise<void>;
}) {
  const { mode } = useAppStore();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.user.name);
  const themeLabel = mode === "night" ? "星夜紫" : mode === "sunrise" ? "暖橙白昼" : "粉樱治愈";
  const avatarLabel =
    state.settings.companionAvatar === "star"
      ? "星星绒绒"
      : state.settings.companionAvatar === "moon"
        ? "月光团团"
        : "花苞小悦";
  const toneLabel =
    state.settings.voiceTone === "youth_girl"
      ? "青春少女音"
      : state.settings.voiceTone === "soft_girl"
        ? "温柔女声"
        : "自然中性";

  const menus = [
    { key: "profile", title: "个人信息", subtitle: "管理头像、昵称、个人资料等", status: "" },
    { key: "health", title: "健康档案", subtitle: "查看身体指标、健康记录与趋势", status: "" },
    { key: "sync", title: "数据保存", subtitle: "本地数据库已启用，云同步待接入", status: "本地已保存" },
    {
      key: "reminders",
      title: "通知 / 提醒设置",
      subtitle: "管理消息通知与提醒偏好",
      status: state.settings.remindersEnabled ? `${state.settings.reminderTime} 提醒` : "已关闭",
    },
    {
      key: "mode",
      title: "主题模式设置",
      subtitle: "星夜紫、暖橙白昼、粉樱治愈三种模式",
      status: themeLabel,
    },
    {
      key: "avatar",
      title: "小悦形象设置",
      subtitle: "选择可爱、治愈、会呼吸的小悦形象",
      status: avatarLabel,
    },
    {
      key: "voice",
      title: "语音陪伴设置",
      subtitle: "默认静音，按需播放或开启自动朗读",
      status: state.settings.voiceCompanionEnabled ? `自动朗读 · ${toneLabel}` : "默认静音",
    },
    { key: "settings", title: "设置", subtitle: "管理产品偏好、数据与隐私说明", status: "" },
  ] as const;

  async function saveProfileName() {
    const next = nameDraft.trim();
    if (!next) {
      onNotice("昵称不能为空");
      return;
    }
    const response = await fetch("/api/user-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    const payload = (await response.json()) as { state?: AppStatePayload; error?: string };
    if (!response.ok || !payload.state) {
      onNotice(payload.error || "保存失败");
      return;
    }
    onState(payload.state);
    setEditingName(false);
    onNotice("昵称已更新");
  }

  return (
    <div className="space-y-3 pb-2">
      <section className="hero-card min-h-[286px]">
        <Image src="/image2/my-hero.png" alt="我的页小悦" width={460} height={280} className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,18,61,.42)_0%,rgba(10,18,61,.28)_56%,rgba(10,18,61,.22)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_90%_at_14%_28%,rgba(10,18,61,.68)_0%,rgba(10,18,61,.4)_45%,rgba(10,18,61,0)_100%)]" />
        <div className="relative z-10 max-w-[55%] p-1">
          <h1 className="text-[25px] font-semibold leading-tight">我的 ⭐</h1>
          <p className="mt-2 text-[15px] leading-[1.55]">管理你的专属空间</p>
        </div>
      </section>

      <GlassCard className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-[18px] border border-white/20 bg-white/10">
            <AnimatedXiaoyue variant={state.settings.companionAvatar} size="sm" talking />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="space-y-2">
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  className="w-full rounded-[12px] border border-white/20 bg-white/10 px-3 py-2 text-[16px] outline-none"
                />
                <div className="flex gap-2">
                  <button className="primary-btn h-[34px] px-4" onClick={() => void saveProfileName()}>保存</button>
                  <button className="ghost-btn h-[34px] px-4" onClick={() => setEditingName(false)}>取消</button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[26px] leading-none font-semibold">{state.user.name}</p>
                <p className="mt-2 text-[15px] text-white/86">愿你每天都被温暖与爱包围 ✨</p>
                <button
                  className="ghost-btn mt-2 h-[34px] px-4"
                  onClick={() => {
                    setNameDraft(state.user.name);
                    setEditingName(true);
                  }}
                >
                  编辑资料
                </button>
              </>
            )}
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/14 text-[24px]">⭐</span>
        </div>
      </GlassCard>

      <GlassCard className="px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-white/62">当前登录账号</p>
            <p className="mt-1 truncate text-[17px] font-semibold">
              {authUser.username || authUser.phone || authUser.displayName}
            </p>
            <p className="mt-1 text-[12px] text-white/62">
              {authUser.primaryProvider === "phone"
                ? "手机快捷登录"
                : authUser.primaryProvider === "wechat"
                  ? "微信登录"
                  : authUser.primaryProvider === "douyin"
                    ? "抖音登录"
                    : "用户名密码登录"}
            </p>
          </div>
          <button className="ghost-btn shrink-0 px-4" onClick={() => void onLogout()}>
            <LogOut className="h-4 w-4" />
            退出
          </button>
        </div>
      </GlassCard>

      <GlassCard className="relative overflow-hidden px-4 py-4" onClick={() => onNavigate("digital-assets", "my")}>
        <p className="text-[20px] font-semibold">人生数字资产</p>
        <p className="text-[13px] text-white/72">记录成长 · 珍藏回忆 · 积累健康 · 累积幸福</p>
        <div className="relative z-10 mt-3 grid grid-cols-4 gap-2 text-center">
          <SummaryCell label="成长值" value="12,560" />
          <SummaryCell label="回忆点" value="860" />
          <SummaryCell label="健康币" value="1,230" />
          <SummaryCell label="幸福值" value="9,888" />
        </div>
        <div className="pointer-events-none absolute right-0 bottom-0 h-16 w-16 translate-y-1/4 rounded-full border border-white/18 bg-[radial-gradient(circle,#ffd89f_8%,#d4a2ff_52%,#8765ff_100%)] opacity-35 shadow-[0_0_32px_rgba(204,154,255,.45)]" />
      </GlassCard>

      {menus.map((item) => (
        <GlassCard
          key={item.key}
          className="px-4 py-4"
          onClick={() => {
            if (item.key === "profile") {
              onNavigate("profile-settings", "my");
              return;
            }
            if (item.key === "health") {
              onNavigate("health-archive", "my");
              return;
            }
            if (item.key === "sync") {
              void onAction("data-sync");
              return;
            }
            if (item.key === "reminders") {
              onNavigate("reminder-settings", "my");
              return;
            }
            if (item.key === "mode") {
              onNavigate("theme-settings", "my");
              return;
            }
            if (item.key === "avatar") {
              onNavigate("companion-avatar-settings", "my");
              return;
            }
            if (item.key === "voice") {
              onNavigate("voice-settings", "my");
              return;
            }
            if (item.key === "settings") {
              onNavigate("general-settings", "my");
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-white/14 text-[19px]">
                {item.title.includes("个人")
                  ? "👤"
                  : item.title.includes("健康")
                    ? "💗"
                    : item.title.includes("数据")
                      ? "☁️"
                      : item.title.includes("通知")
                        ? "🔔"
                        : item.title.includes("主题")
                          ? "🎨"
                          : item.title.includes("小悦")
                            ? "⭐"
                            : item.title.includes("语音")
                              ? "🔊"
                              : "⚙️"}
              </span>
              <div>
                <p className="text-[18px] leading-[1.15] font-semibold">{item.title}</p>
                <p className="mt-1 text-[13px] text-white/70">{item.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {item.status && <span className="max-w-[86px] text-right text-[12px] leading-4 text-emerald-300">{item.status}</span>}
              <ChevronRight className="h-4 w-4 text-white/70" />
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function ThemeSettingsScreen({
  state,
  onState,
  onBack,
  onNotice,
}: {
  state: AppStatePayload;
  onState: (state: AppStatePayload) => void;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const { mode, setMode } = useAppStore();
  const [saving, setSaving] = useState<ThemeMode | null>(null);
  const themes: Array<{
    value: ThemeMode;
    title: string;
    subtitle: string;
    desc: string;
  }> = [
    { value: "night", title: "星夜紫", subtitle: "当前默认", desc: "适合夜间陪伴、情绪安抚和沉浸式记录。" },
    { value: "sunrise", title: "暖橙白昼", subtitle: "浅橙暖色系", desc: "适合白天使用，像晨光和热茶一样轻柔。" },
    { value: "blossom", title: "粉樱治愈", subtitle: "粉色系", desc: "更柔软、更亲近，适合情绪支持与自我照顾。" },
  ];

  async function save(nextMode: ThemeMode) {
    if (saving) return;
    setSaving(nextMode);
    setMode(nextMode);
    try {
      const response = await fetch("/api/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      const payload = (await response.json()) as { state?: AppStatePayload; error?: string };
      if (!response.ok || !payload.state) {
        setMode(state.user.currentMode);
        onNotice(payload.error || "主题保存失败");
        return;
      }
      onState(payload.state);
      onNotice(`已切换到${themes.find((item) => item.value === nextMode)?.title ?? "新主题"}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <SubHeader title="主题模式设置" source="来自我的 · 主题模式" onBack={onBack} />
      <GlassCard className="p-4">
        <p className="text-[18px] font-semibold">选择今天的陪伴氛围</p>
        <p className="mt-1 text-[13px] leading-6 text-white/70">主题会同步影响首页、陪伴、时光记、我的、底部导航和主要操作控件。</p>
      </GlassCard>
      <div className="space-y-3">
        {themes.map((item) => {
          const active = mode === item.value;
          return (
            <button
              key={item.value}
              className={clsx(
                "theme-choice theme-preview w-full rounded-[22px] border p-4 text-left transition active:scale-[0.99]",
                `preview-${item.value}`,
                active ? "border-white/55 shadow-[0_0_28px_rgba(255,255,255,.24)]" : "border-white/16",
              )}
              onClick={() => void save(item.value)}
              disabled={Boolean(saving)}
            >
              <div className="flex items-center gap-4">
                <div className="theme-swatch grid h-20 w-20 shrink-0 place-items-center rounded-[22px]">
                  <AnimatedXiaoyue variant={state.settings.companionAvatar} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[20px] font-semibold">{item.title}</p>
                    {active && <span className="rounded-full bg-white/18 px-2 py-0.5 text-[11px]">使用中</span>}
                  </div>
                  <p className="mt-1 text-[13px] text-white/72">{item.subtitle}</p>
                  <p className="mt-1 text-[12px] leading-5 text-white/64">{item.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-white/64" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompanionAvatarSettingsScreen({
  state,
  onState,
  onBack,
  onNotice,
}: {
  state: AppStatePayload;
  onState: (state: AppStatePayload) => void;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const [saving, setSaving] = useState<CompanionAvatar | null>(null);
  const avatars: Array<{ value: CompanionAvatar; title: string; desc: string }> = [
    { value: "star", title: "星星绒绒", desc: "默认形象，抱着小星星，像夜灯一样安静陪你。" },
    { value: "moon", title: "月光团团", desc: "更软糯、更放松，适合晚安故事和睡前陪伴。" },
    { value: "flower", title: "花苞小悦", desc: "更明亮、更治愈，适合白天记录和情绪鼓励。" },
  ];

  async function save(avatar: CompanionAvatar) {
    if (saving) return;
    setSaving(avatar);
    try {
      const response = await fetch("/api/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companionAvatar: avatar }),
      });
      const payload = (await response.json()) as { state?: AppStatePayload; error?: string };
      if (!response.ok || !payload.state) {
        onNotice(payload.error || "小悦形象保存失败");
        return;
      }
      onState(payload.state);
      onNotice(`已选择${avatars.find((item) => item.value === avatar)?.title ?? "小悦形象"}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <SubHeader title="小悦形象设置" source="来自我的 · 小悦形象" onBack={onBack} />
      <GlassCard className="p-4">
        <div className="flex items-center gap-4">
          <AnimatedXiaoyue variant={state.settings.companionAvatar} size="lg" talking />
          <div>
            <p className="text-[20px] font-semibold">会呼吸的小悦</p>
            <p className="mt-1 text-[13px] leading-6 text-white/72">当前版本使用 CSS 3D 动画形象，保证三套主题里风格统一、加载快、不会拼接。</p>
          </div>
        </div>
      </GlassCard>
      <div className="grid grid-cols-1 gap-3">
        {avatars.map((item) => {
          const active = state.settings.companionAvatar === item.value;
          return (
            <button
              key={item.value}
              className={clsx(
                "rounded-[22px] border bg-white/8 p-4 text-left transition active:scale-[0.99]",
                active ? "border-[#ffe2a4] bg-white/14 shadow-[0_0_26px_rgba(255,224,164,.28)]" : "border-white/14",
              )}
              onClick={() => void save(item.value)}
              disabled={Boolean(saving)}
            >
              <div className="flex items-center gap-4">
                <AnimatedXiaoyue variant={item.value} size="md" talking={active} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[18px] font-semibold">{item.title}</p>
                    {active && <span className="rounded-full bg-[#ffe2a4]/18 px-2 py-0.5 text-[11px] text-[#ffe2a4]">使用中</span>}
                  </div>
                  <p className="mt-1 text-[13px] leading-6 text-white/70">{item.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-white/62" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReminderSettingsScreen({
  state,
  onState,
  onBack,
  onNotice,
}: {
  state: AppStatePayload;
  onState: (state: AppStatePayload) => void;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(state.settings.remindersEnabled);
  const [time, setTime] = useState(state.settings.reminderTime || "21:30");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remindersEnabled: enabled,
          reminderTime: time,
        }),
      });
      const payload = (await response.json()) as { state?: AppStatePayload; error?: string };
      if (!response.ok || !payload.state) {
        onNotice(payload.error || "提醒设置保存失败");
        return;
      }
      onState(payload.state);
      onNotice(enabled ? `已设置 ${time} 晚间提醒` : "已关闭晚间提醒");
    } finally {
      setSaving(false);
    }
  }

  async function testReminder() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      onNotice("当前浏览器不支持系统提醒");
      return;
    }
    if (Notification.permission === "default") {
      await Notification.requestPermission().catch(() => undefined);
    }
    if (Notification.permission !== "granted") {
      onNotice("未获取提醒权限，请先在浏览器允许通知");
      return;
    }
    const text = "测试提醒：今天已经很努力了，先喝口水，慢慢放松。";
    new Notification("幸福人生 · 提醒测试", { body: text });
    onNotice("提醒测试已发送");
  }

  return (
    <div className="space-y-4">
      <SubHeader title="通知 / 提醒设置" source="来自我的 · 通知设置" onBack={onBack} />
      <GlassCard className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[18px] font-semibold">晚间提醒</p>
            <p className="text-[13px] text-white/72">在你设定的时间，小悦会提醒你慢下来</p>
          </div>
          <button
            className={clsx(
              "h-8 w-14 rounded-full border p-1 transition",
              enabled ? "border-[#c8b4ff] bg-[#9f83ff]/45" : "border-white/22 bg-white/12",
            )}
            onClick={() => setEnabled((v) => !v)}
            aria-label={enabled ? "关闭晚间提醒" : "开启晚间提醒"}
          >
            <span
              className={clsx(
                "block h-6 w-6 rounded-full bg-white transition",
                enabled ? "translate-x-6" : "translate-x-0",
              )}
            />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] text-white/72">提醒时间</label>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="w-full rounded-[14px] border border-white/18 bg-white/10 px-3 py-2.5 text-[15px] outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button className="primary-btn" onClick={() => void save()} disabled={saving}>
            {saving ? "保存中…" : "保存设置"}
          </button>
          <button className="ghost-btn" onClick={() => void testReminder()}>测试提醒</button>
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[16px] font-semibold">提醒文案预览</p>
        <p className="mt-2 text-[14px] leading-6 text-white/82">
          到你约定的提醒时间啦。今晚先照顾好自己，喝口水，再慢慢放松。
        </p>
      </GlassCard>
    </div>
  );
}

function VoiceSettingsScreen({
  state,
  onState,
  onBack,
  onNotice,
}: {
  state: AppStatePayload;
  onState: (state: AppStatePayload) => void;
  onBack: () => void;
  onNotice: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(state.settings.voiceCompanionEnabled);
  const [tone, setTone] = useState<AppStatePayload["settings"]["voiceTone"]>(state.settings.voiceTone);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceCompanionEnabled: enabled,
          voiceTone: tone,
        }),
      });
      const payload = (await response.json()) as { state?: AppStatePayload; error?: string };
      if (!response.ok || !payload.state) {
        onNotice(payload.error || "语音设置保存失败");
        return;
      }
      onState(payload.state);
      onNotice("语音陪伴设置已更新");
    } finally {
      setSaving(false);
    }
  }

  async function testVoice() {
    const result = await speak("嗨，我是小悦。今天辛苦啦，我会一直温柔地陪你。", tone);
    if (result === "cloud") {
      onNotice("已播放云端少女音试音");
      return;
    }
    if (result === "system") {
      onNotice("当前使用的是设备系统音，建议配置云端少女音");
      return;
    }
    onNotice("云端少女音还没配置，我先不播放难听的系统音");
  }

  return (
    <div className="space-y-4">
      <SubHeader title="语音陪伴设置" source="来自我的 · 语音设置" onBack={onBack} />
      <GlassCard className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[18px] font-semibold">回复自动朗读</p>
            <p className="text-[13px] text-white/72">默认关闭。开启后，小悦回复时才会自动出声</p>
          </div>
          <button
            className={clsx(
              "h-8 w-14 rounded-full border p-1 transition",
              enabled ? "border-[#c8b4ff] bg-[#9f83ff]/45" : "border-white/22 bg-white/12",
            )}
            onClick={() => setEnabled((v) => !v)}
            aria-label={enabled ? "关闭回复自动朗读" : "开启回复自动朗读"}
          >
            <span
              className={clsx(
                "block h-6 w-6 rounded-full bg-white transition",
                enabled ? "translate-x-6" : "translate-x-0",
              )}
            />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] text-white/72">音色选择</p>
          <div className="grid grid-cols-1 gap-2">
            {[
              { value: "youth_girl" as const, title: "青春少女音", desc: "更清亮、更年轻、更有陪伴感" },
              { value: "soft_girl" as const, title: "温柔女声", desc: "更柔和、适合夜晚安抚" },
              { value: "warm_neutral" as const, title: "自然中性", desc: "更克制、稳定叙述" },
            ].map((item) => (
              <button
                key={item.value}
                className={clsx(
                  "rounded-[14px] border px-3 py-2 text-left",
                  tone === item.value ? "border-[#cab8ff] bg-[#a98eff]/24" : "border-white/14 bg-white/8",
                )}
                onClick={() => setTone(item.value)}
              >
                <p className="text-[15px] font-semibold">{item.title}</p>
                <p className="text-[12px] text-white/72">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button className="primary-btn" onClick={() => void save()} disabled={saving}>
            {saving ? "保存中…" : "保存设置"}
          </button>
          <button className="ghost-btn" onClick={() => void testVoice()}>试听</button>
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <p className="text-[16px] font-semibold">安静优先</p>
        <p className="mt-2 text-[13px] leading-6 text-white/72">
          即使保持默认静音，你仍然可以在每条小悦回复旁主动点击“听小悦说”。没有配置真实云端少女音时，小悦不会再回退到生硬的系统音。
        </p>
      </GlassCard>
    </div>
  );
}

function SubHeader({
  title,
  source,
  onBack,
}: {
  title: string;
  source: string;
  onBack?: () => void;
}) {
  return (
    <header className="sub-header space-y-2 pb-1">
      <button className="icon-btn" aria-label="返回" onClick={onBack ?? (() => useAppStore.getState().setScreen("home", "home"))}>
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
        <p className="text-[13px] text-white/70">{source}</p>
      </div>
    </header>
  );
}

function BottomNav({
  activeTab,
  onNavigate,
}: {
  activeTab: string;
  onNavigate: (screen: Screen, tab?: Tab) => void;
}) {
  const items = [
    { tab: "home", label: "首页", icon: Home, screen: "home" as Screen },
    { tab: "companion", label: "陪伴", icon: Heart, screen: "companion" as Screen },
    { tab: "plus", label: "", icon: Plus, screen: "quick-record" as Screen },
    { tab: "memories", label: "时光记", icon: NotebookPen, screen: "memories" as Screen },
    { tab: "my", label: "我的", icon: User, screen: "my" as Screen },
  ];
  return (
    <div className="bottom-nav-wrap absolute inset-x-0 bottom-0 z-30 px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <nav className="bottom-nav grid w-full grid-cols-5 rounded-[30px] border border-white/14 bg-[#18235f]/90 px-2 py-3 shadow-[0_14px_26px_rgba(7,12,44,.45)] backdrop-blur-xl">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              aria-label={item.label || "快速记录"}
              className={clsx(
                "flex min-w-0 flex-col items-center gap-1 overflow-visible text-[12px] text-white/78",
                item.tab === "plus" && "-mt-8",
                activeTab === item.tab && "text-white",
              )}
              onClick={() => onNavigate(item.screen, item.tab as Tab)}
            >
              <span className={clsx(item.tab === "plus" ? "grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#c7b4ff] to-[#6f56ff] shadow-[0_0_30px_rgba(160,130,255,.68)]" : "grid h-8 w-8 place-items-center")}>
                <Icon className={clsx(item.tab === "plus" ? "h-8 w-8" : "h-5 w-5")} />
              </span>
              {item.label && <span className="max-w-full truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function AnimatedXiaoyue({
  variant,
  size = "md",
  talking = false,
}: {
  variant: CompanionAvatar;
  size?: "xs" | "sm" | "md" | "lg";
  talking?: boolean;
}) {
  return (
    <div className={clsx("xiaoyue-avatar", `xiaoyue-${variant}`, `xiaoyue-${size}`, talking && "is-talking")} aria-label="小悦形象">
      <div className="xiaoyue-shadow" />
      <div className="xiaoyue-body">
        <span className="xiaoyue-hair" />
        <span className="xiaoyue-ear left" />
        <span className="xiaoyue-ear right" />
        <span className="xiaoyue-eye left" />
        <span className="xiaoyue-eye right" />
        <span className="xiaoyue-blush left" />
        <span className="xiaoyue-blush right" />
        <span className="xiaoyue-mouth" />
        <span className="xiaoyue-hand left" />
        <span className="xiaoyue-hand right" />
        <span className="xiaoyue-charm" />
        <span className="xiaoyue-wave one" />
        <span className="xiaoyue-wave two" />
      </div>
    </div>
  );
}

function NightBackdrop({ mode }: { mode: ThemeMode }) {
  return (
    <div className="theme-backdrop fixed inset-0 -z-10 overflow-hidden" data-theme={mode}>
      <div className="theme-bg absolute inset-0" />
      <div className="theme-stars absolute inset-0" />
      <div className="theme-glow absolute -top-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl" />
    </div>
  );
}

function GlassCard({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <section
      className={clsx(
        "glass-card rounded-[24px] border border-white/16 bg-[linear-gradient(145deg,rgba(128,112,208,.38),rgba(34,46,112,.5))] shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_18px_45px_rgba(5,10,38,.35)] backdrop-blur-xl",
        onClick && "cursor-pointer transition active:scale-[0.99]",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </section>
  );
}

function StatusInline({
  icon,
  label,
  value,
  progress,
  progressColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress?: number;
  progressColor?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-[#ffe39e]">{icon}</div>
      <p className="text-[12px] text-white/70">{label}</p>
      <p className="mt-0.5 truncate text-[16px] leading-tight font-semibold">{value}</p>
      {typeof progress === "number" && (
        <div className="mt-2 h-1.5 w-14 overflow-hidden rounded-full bg-white/20">
          <div className={clsx("h-full rounded-full bg-[#ad92ff]", progressColor)} style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }} />
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-white/64">{label}</p>
      <p className="mt-1 text-[18px] font-semibold">{value}</p>
    </div>
  );
}

function LineTrend({ values }: { values: number[] }) {
  const points = useMemo(() => values.map((value, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${100 - value}`).join(" "), [values]);
  return (
    <svg viewBox="0 0 100 100" className="mt-3 h-28 w-full overflow-visible">
      <defs>
        <linearGradient id="trend-line" x1="0" x2="1">
          <stop offset="0%" stopColor="#b39bff" />
          <stop offset="100%" stopColor="#ffd58a" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke="url(#trend-line)" strokeWidth="3" points={points} />
      {values.map((value, i) => (
        <circle key={`${i}-${value}`} cx={(i / Math.max(values.length - 1, 1)) * 100} cy={100 - value} r="2.1" fill="#fff2b7" />
      ))}
    </svg>
  );
}
