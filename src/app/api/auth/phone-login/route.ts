import { NextResponse } from "next/server";
import { attachSession, loginWithPhoneCode } from "@/lib/auth";
import { updateUserName } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    phone?: string;
    code?: string;
  };

  const result = loginWithPhoneCode(body.phone ?? "", body.code ?? "");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  updateUserName(result.user.displayName);
  const response = NextResponse.json({ user: result.user });
  attachSession(response, result.user.id, request);
  return response;
}
