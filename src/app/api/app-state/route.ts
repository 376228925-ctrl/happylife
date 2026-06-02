import { NextResponse } from "next/server";
import { getAppState } from "@/lib/db";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getAppState());
}
