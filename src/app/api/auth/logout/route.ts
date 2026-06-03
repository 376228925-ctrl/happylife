import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export const runtime = "nodejs";

export function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  clearSession(request, response);
  return response;
}
