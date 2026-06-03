import { NextResponse } from "next/server";
import { attachSession, consumeOAuthState, exchangeOAuthUser, type AuthProvider } from "@/lib/auth";
import { updateUserName } from "@/lib/db";

export const runtime = "nodejs";

function pickProvider(value: string): AuthProvider | null {
  if (value === "wechat" || value === "douyin") return value;
  return null;
}

function redirectWithError(request: Request, message: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("auth_error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const picked = pickProvider(provider);
  if (!picked) return redirectWithError(request, "不支持的登录方式");

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !state) {
    return redirectWithError(request, "第三方授权参数缺失");
  }
  if (!consumeOAuthState(picked, state)) {
    return redirectWithError(request, "授权状态已过期，请重新登录");
  }

  const result = await exchangeOAuthUser(picked, code, request);
  if ("error" in result) {
    return redirectWithError(request, result.error);
  }

  updateUserName(result.user.displayName);
  const response = NextResponse.redirect(new URL("/", request.url));
  attachSession(response, result.user.id, request);
  return response;
}
