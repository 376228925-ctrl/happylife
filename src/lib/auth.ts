import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const AUTH_COOKIE = "happylife_session";

const SESSION_DAYS = 30;
const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type Row = Record<string, unknown>;

export type AuthProvider = "wechat" | "douyin";

export type AuthUser = {
  id: string;
  displayName: string;
  username: string | null;
  phone: string | null;
  avatarUrl: string | null;
  primaryProvider: string;
};

export type RequireAuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

function nowIso() {
  return new Date().toISOString();
}

function expiresIso(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").replace(/^\+86/, "");
}

function validPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function validUsername(username: string) {
  return /^[a-z0-9_@.-]{3,32}$/.test(username);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function rowToUser(row: Row): AuthUser {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    username: row.username ? String(row.username) : null,
    phone: row.phone ? String(row.phone) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    primaryProvider: String(row.primary_provider ?? "password"),
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored?.startsWith("scrypt:")) return false;
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getSessionUser(request: Request): AuthUser | null {
  const token = parseCookie(request.headers.get("cookie"), AUTH_COOKIE);
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT u.*
      FROM auth_sessions s
      JOIN auth_users u ON u.id = s.user_id
      WHERE s.token_hash = @token_hash AND s.expires_at > @now
      LIMIT 1
    `,
    )
    .get({ token_hash: hashToken(token), now: nowIso() }) as Row | undefined;

  if (!row) return null;

  db.prepare("UPDATE auth_sessions SET last_seen_at = @now WHERE token_hash = @token_hash").run({
    now: nowIso(),
    token_hash: hashToken(token),
  });

  return rowToUser(row);
}

export function requireAuth(request: Request): RequireAuthResult {
  const user = getSessionUser(request);
  if (user) return { ok: true, user };
  return {
    ok: false,
    response: NextResponse.json(
      { error: "AUTH_REQUIRED", message: "请先登录幸福人生账号" },
      { status: 401 },
    ),
  };
}

export function attachSession(response: NextResponse, userId: string, request: Request) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  getDb()
    .prepare(
      `
      INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, user_agent, ip)
      VALUES (@id, @user_id, @token_hash, @expires_at, @user_agent, @ip)
    `,
    )
    .run({
      id: randomUUID(),
      user_id: userId,
      token_hash: hashToken(token),
      expires_at: expires.toISOString(),
      user_agent: request.headers.get("user-agent") ?? "",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    });

  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export function clearSession(request: Request, response: NextResponse) {
  const token = parseCookie(request.headers.get("cookie"), AUTH_COOKIE);
  if (token) {
    getDb().prepare("DELETE FROM auth_sessions WHERE token_hash = @token_hash").run({
      token_hash: hashToken(token),
    });
  }
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function createPasswordUser(input: {
  username: string;
  password: string;
  displayName?: string;
  phone?: string;
}) {
  const username = normalizeUsername(input.username);
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const password = input.password.trim();
  const displayName = (input.displayName?.trim() || input.username.trim()).slice(0, 20);

  if (!validUsername(username)) {
    return { error: "用户名需为 3-32 位英文、数字、下划线、点或邮箱格式字符" };
  }
  if (password.length < 8) {
    return { error: "密码至少需要 8 位" };
  }
  if (phone && !validPhone(phone)) {
    return { error: "手机号格式不正确" };
  }

  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM auth_users WHERE username = @username OR (@phone IS NOT NULL AND phone = @phone) LIMIT 1")
    .get({ username, phone }) as Row | undefined;
  if (exists) {
    return { error: "账号已存在，请直接登录" };
  }

  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO auth_users (id, display_name, username, phone, password_hash, primary_provider)
    VALUES (@id, @display_name, @username, @phone, @password_hash, 'password')
  `,
  ).run({
    id,
    display_name: displayName,
    username,
    phone,
    password_hash: hashPassword(password),
  });

  const row = db.prepare("SELECT * FROM auth_users WHERE id = @id").get({ id }) as Row;
  return { user: rowToUser(row) };
}

export function loginWithPassword(identifier: string, password: string) {
  const raw = identifier.trim();
  const phoneLike = /^\+?\d[\d\s-]*$/.test(raw);
  const normalized = phoneLike ? normalizePhone(raw) : normalizeUsername(raw);
  const row = getDb()
    .prepare("SELECT * FROM auth_users WHERE username = @identifier OR phone = @identifier LIMIT 1")
    .get({ identifier: normalized }) as Row | undefined;

  if (!row || !verifyPassword(password, row.password_hash as string | null)) {
    return { error: "账号或密码不正确" };
  }

  getDb().prepare("UPDATE auth_users SET last_login_at = @now WHERE id = @id").run({
    now: nowIso(),
    id: String(row.id),
  });

  return { user: rowToUser(row) };
}

export function createPhoneCode(phoneInput: string, request: Request) {
  const phone = normalizePhone(phoneInput);
  if (!validPhone(phone)) {
    return { error: "请输入有效的中国大陆手机号" };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  getDb()
    .prepare(
      `
      INSERT INTO phone_login_codes (id, phone, code_hash, expires_at, ip)
      VALUES (@id, @phone, @code_hash, @expires_at, @ip)
    `,
    )
    .run({
      id: randomUUID(),
      phone,
      code_hash: hashToken(code),
      expires_at: expiresIso(PHONE_CODE_TTL_MS),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    });

  const smsReady = Boolean(
    process.env.TENCENT_SMS_SECRET_ID?.trim() &&
      process.env.TENCENT_SMS_SECRET_KEY?.trim() &&
      process.env.TENCENT_SMS_SDK_APP_ID?.trim() &&
      process.env.TENCENT_SMS_SIGN_NAME?.trim() &&
      process.env.TENCENT_SMS_TEMPLATE_ID?.trim(),
  );

  return {
    phone,
    expiresInSeconds: Math.round(PHONE_CODE_TTL_MS / 1000),
    delivery: smsReady ? "sms" : "preview",
    previewCode: smsReady ? undefined : code,
  };
}

export function loginWithPhoneCode(phoneInput: string, codeInput: string) {
  const phone = normalizePhone(phoneInput);
  const code = codeInput.trim();
  if (!validPhone(phone) || !/^\d{6}$/.test(code)) {
    return { error: "手机号或验证码格式不正确" };
  }

  const db = getDb();
  const codeRow = db
    .prepare(
      `
      SELECT * FROM phone_login_codes
      WHERE phone = @phone AND consumed_at IS NULL AND expires_at > @now
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .get({ phone, now: nowIso() }) as Row | undefined;

  if (!codeRow || String(codeRow.code_hash) !== hashToken(code)) {
    return { error: "验证码不正确或已过期" };
  }

  db.prepare("UPDATE phone_login_codes SET consumed_at = @now WHERE id = @id").run({
    now: nowIso(),
    id: String(codeRow.id),
  });

  let row = db.prepare("SELECT * FROM auth_users WHERE phone = @phone LIMIT 1").get({ phone }) as Row | undefined;
  if (!row) {
    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO auth_users (id, display_name, phone, primary_provider)
      VALUES (@id, @display_name, @phone, 'phone')
    `,
    ).run({
      id,
      display_name: `用户${phone.slice(-4)}`,
      phone,
    });
    row = db.prepare("SELECT * FROM auth_users WHERE id = @id").get({ id }) as Row;
  }

  db.prepare("UPDATE auth_users SET last_login_at = @now WHERE id = @id").run({
    now: nowIso(),
    id: String(row.id),
  });

  return { user: rowToUser(row) };
}

export function getOAuthConfig(provider: AuthProvider, origin: string) {
  const baseUrl = (process.env.AUTH_BASE_URL?.trim() || origin).replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;
  if (provider === "wechat") {
    return {
      configured: Boolean(process.env.WECHAT_OAUTH_APP_ID?.trim() && process.env.WECHAT_OAUTH_APP_SECRET?.trim()),
      appId: process.env.WECHAT_OAUTH_APP_ID?.trim() ?? "",
      secret: process.env.WECHAT_OAUTH_APP_SECRET?.trim() ?? "",
      redirectUri,
    };
  }
  return {
    configured: Boolean(process.env.DOUYIN_CLIENT_KEY?.trim() && process.env.DOUYIN_CLIENT_SECRET?.trim()),
    appId: process.env.DOUYIN_CLIENT_KEY?.trim() ?? "",
    secret: process.env.DOUYIN_CLIENT_SECRET?.trim() ?? "",
    redirectUri,
  };
}

export function createOAuthStart(provider: AuthProvider, request: Request) {
  const origin = new URL(request.url).origin;
  const config = getOAuthConfig(provider, origin);
  if (!config.configured) {
    return {
      configured: false,
      message: provider === "wechat" ? "微信开放平台密钥未配置" : "抖音开放平台密钥未配置",
    };
  }

  const state = randomBytes(24).toString("base64url");
  getDb()
    .prepare(
      `
      INSERT INTO oauth_states (id, provider, state, redirect_to, expires_at)
      VALUES (@id, @provider, @state, @redirect_to, @expires_at)
    `,
    )
    .run({
      id: randomUUID(),
      provider,
      state,
      redirect_to: "/",
      expires_at: expiresIso(OAUTH_STATE_TTL_MS),
    });

  const redirectUri = encodeURIComponent(config.redirectUri);
  if (provider === "wechat") {
    return {
      configured: true,
      url: `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(config.appId)}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`,
    };
  }

  return {
    configured: true,
    url: `https://www.douyin.com/passport/oauth/connect/?client_key=${encodeURIComponent(config.appId)}&response_type=code&scope=user_info&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}`,
  };
}

export function consumeOAuthState(provider: AuthProvider, state: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM oauth_states WHERE provider = @provider AND state = @state AND expires_at > @now LIMIT 1")
    .get({ provider, state, now: nowIso() }) as Row | undefined;
  if (!row) return false;
  db.prepare("DELETE FROM oauth_states WHERE id = @id").run({ id: String(row.id) });
  return true;
}

export async function exchangeOAuthUser(provider: AuthProvider, code: string, request: Request) {
  const origin = new URL(request.url).origin;
  const config = getOAuthConfig(provider, origin);
  if (!config.configured) {
    return { error: "第三方登录密钥未配置" };
  }

  if (provider === "wechat") {
    const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
    tokenUrl.searchParams.set("appid", config.appId);
    tokenUrl.searchParams.set("secret", config.secret);
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("grant_type", "authorization_code");
    const token = (await fetch(tokenUrl, { cache: "no-store" }).then((r) => r.json())) as Record<string, unknown>;
    const openid = typeof token.openid === "string" ? token.openid : "";
    const accessToken = typeof token.access_token === "string" ? token.access_token : "";
    if (!openid || !accessToken) {
      return { error: "微信授权失败，请重新尝试" };
    }
    const infoUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
    infoUrl.searchParams.set("access_token", accessToken);
    infoUrl.searchParams.set("openid", openid);
    infoUrl.searchParams.set("lang", "zh_CN");
    const info = (await fetch(infoUrl, { cache: "no-store" }).then((r) => r.json())) as Record<string, unknown>;
    return upsertOAuthUser({
      provider,
      providerUserId: openid,
      unionId: typeof token.unionid === "string" ? token.unionid : typeof info.unionid === "string" ? info.unionid : null,
      nickname: typeof info.nickname === "string" ? info.nickname : "微信用户",
      avatarUrl: typeof info.headimgurl === "string" ? info.headimgurl : null,
    });
  }

  const tokenUrl = new URL(process.env.DOUYIN_TOKEN_URL?.trim() || "https://open.douyin.com/oauth/access_token/");
  tokenUrl.searchParams.set("client_key", config.appId);
  tokenUrl.searchParams.set("client_secret", config.secret);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  const tokenPayload = (await fetch(tokenUrl, { cache: "no-store" }).then((r) => r.json())) as Record<string, unknown>;
  const data = (tokenPayload.data && typeof tokenPayload.data === "object" ? tokenPayload.data : tokenPayload) as Record<string, unknown>;
  const openId = typeof data.open_id === "string" ? data.open_id : "";
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!openId || !accessToken) {
    return { error: "抖音授权失败，请重新尝试" };
  }
  const userInfoUrl = new URL(process.env.DOUYIN_USERINFO_URL?.trim() || "https://open.douyin.com/oauth/userinfo/");
  userInfoUrl.searchParams.set("open_id", openId);
  userInfoUrl.searchParams.set("access_token", accessToken);
  const infoPayload = (await fetch(userInfoUrl, { cache: "no-store" }).then((r) => r.json())) as Record<string, unknown>;
  const info = (infoPayload.data && typeof infoPayload.data === "object" ? infoPayload.data : infoPayload) as Record<string, unknown>;
  return upsertOAuthUser({
    provider,
    providerUserId: openId,
    unionId: typeof data.union_id === "string" ? data.union_id : null,
    nickname: typeof info.nickname === "string" ? info.nickname : "抖音用户",
    avatarUrl: typeof info.avatar === "string" ? info.avatar : null,
  });
}

function upsertOAuthUser(input: {
  provider: AuthProvider;
  providerUserId: string;
  unionId: string | null;
  nickname: string;
  avatarUrl: string | null;
}) {
  const db = getDb();
  const linked = db
    .prepare(
      `
      SELECT u.*
      FROM oauth_accounts a
      JOIN auth_users u ON u.id = a.user_id
      WHERE a.provider = @provider AND a.provider_user_id = @provider_user_id
      LIMIT 1
    `,
    )
    .get({ provider: input.provider, provider_user_id: input.providerUserId }) as Row | undefined;

  if (linked) {
    db.prepare("UPDATE auth_users SET display_name = @display_name, avatar_url = @avatar_url, last_login_at = @now WHERE id = @id").run({
      display_name: input.nickname.slice(0, 30),
      avatar_url: input.avatarUrl,
      now: nowIso(),
      id: String(linked.id),
    });
    return { user: rowToUser({ ...linked, display_name: input.nickname, avatar_url: input.avatarUrl }) };
  }

  const userId = randomUUID();
  db.prepare(
    `
    INSERT INTO auth_users (id, display_name, avatar_url, primary_provider, last_login_at)
    VALUES (@id, @display_name, @avatar_url, @provider, @now)
  `,
  ).run({
    id: userId,
    display_name: input.nickname.slice(0, 30),
    avatar_url: input.avatarUrl,
    provider: input.provider,
    now: nowIso(),
  });
  db.prepare(
    `
    INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, union_id, nickname, avatar_url)
    VALUES (@id, @user_id, @provider, @provider_user_id, @union_id, @nickname, @avatar_url)
  `,
  ).run({
    id: randomUUID(),
    user_id: userId,
    provider: input.provider,
    provider_user_id: input.providerUserId,
    union_id: input.unionId,
    nickname: input.nickname,
    avatar_url: input.avatarUrl,
  });

  const row = db.prepare("SELECT * FROM auth_users WHERE id = @id").get({ id: userId }) as Row;
  return { user: rowToUser(row) };
}
