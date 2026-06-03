import { NextResponse } from "next/server";
import { attachSession, createPasswordUser } from "@/lib/auth";
import { updateUserName } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    displayName?: string;
    phone?: string;
  };

  const result = createPasswordUser({
    username: body.username ?? "",
    password: body.password ?? "",
    displayName: body.displayName,
    phone: body.phone,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  updateUserName(result.user.displayName);
  const response = NextResponse.json({ user: result.user });
  attachSession(response, result.user.id, request);
  return response;
}
