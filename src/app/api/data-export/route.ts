import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAppState } from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const exportedAt = new Date().toISOString();
  const payload = {
    app: "幸福人生",
    formatVersion: 1,
    exportedAt,
    data: getAppState(),
  };
  const date = exportedAt.slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename=\"happylife-backup-${date}.json\"`,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
