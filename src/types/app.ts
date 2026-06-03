export type Screen =
  | "home"
  | "health-overview"
  | "sleep-care"
  | "emotion-value"
  | "emotion-diary"
  | "diet-health"
  | "exercise-health"
  | "water-reminder"
  | "stress-energy"
  | "ai-suggestion"
  | "companion"
  | "quick-record"
  | "memories"
  | "memory-journal"
  | "memory-gallery"
  | "small-happiness"
  | "ai-memoir"
  | "life-timeline"
  | "all-memories"
  | "relax-session"
  | "story-player"
  | "digital-assets"
  | "profile-settings"
  | "health-archive"
  | "general-settings"
  | "reminder-settings"
  | "theme-settings"
  | "companion-avatar-settings"
  | "voice-settings"
  | "my";

export type ThemeMode = "night" | "sunrise" | "blossom";

export type CompanionAvatar = "star" | "moon" | "flower";

export type UserProfile = {
  id: string;
  name: string;
  companionName: string;
  currentMode: ThemeMode;
};

export type UserSettings = {
  remindersEnabled: boolean;
  reminderTime: string;
  dataSynced: boolean;
  voiceCompanionEnabled: boolean;
  voiceTone: "youth_girl" | "soft_girl" | "warm_neutral";
  companionAvatar: CompanionAvatar;
};

export type TodayStatus = {
  sleepScore: number;
  sleepHours: number;
  moodLabel: string;
  energy: number;
  stress: number;
  waterCups: number;
  exerciseMinutes: number;
  steps: number;
  dietBalance: number;
  focusMinutes: number;
  completedTasks: number;
  totalTasks: number;
};

export type HealthMetric = {
  id: string;
  category: "sleep" | "emotion" | "diet" | "exercise" | "water" | "stress";
  score: number | null;
  primaryText: string;
  statusText: string;
  detail: Record<string, unknown>;
  aiComment: string;
};

export type AiSuggestion = {
  id: string;
  scene: string;
  title: string;
  message: string;
  actionText: string;
  target: Screen | null;
  isPrimary: boolean;
};

export type MemoryItem = {
  id: string;
  type: string;
  title: string;
  content: string;
  mood: string | null;
  time: string;
  tags: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  emotionTag?: string | null;
};

export type TodayPlan = {
  id: string;
  title: string;
  category: string;
  done: boolean;
};

export type AppStatePayload = {
  user: UserProfile;
  settings: UserSettings;
  today: TodayStatus;
  metrics: HealthMetric[];
  suggestions: AiSuggestion[];
  memories: MemoryItem[];
  chat: ChatMessage[];
  plans: TodayPlan[];
};
