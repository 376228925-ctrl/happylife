import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAppState } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(getAppState());
}
