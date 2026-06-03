import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export function GET(request: Request) {
  const user = getSessionUser(request);
  return NextResponse.json({
    authenticated: Boolean(user),
    user,
  });
}
