import { NextResponse } from "next/server";
import { createOAuthStart, type AuthProvider } from "@/lib/auth";

export const runtime = "nodejs";

function pickProvider(value: string): AuthProvider | null {
  if (value === "wechat" || value === "douyin") return value;
  return null;
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const picked = pickProvider(provider);
  if (!picked) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
  }
  const result = createOAuthStart(picked, request);
  if (!result.configured) {
    return NextResponse.json({ error: "OAUTH_NOT_CONFIGURED", message: result.message }, { status: 501 });
  }
  return NextResponse.json({ url: result.url });
}
