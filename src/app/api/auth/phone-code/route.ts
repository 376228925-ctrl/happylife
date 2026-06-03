import { NextResponse } from "next/server";
import { createPhoneCode } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { phone?: string };
  const result = createPhoneCode(body.phone ?? "", request);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    phone: result.phone,
    expiresInSeconds: result.expiresInSeconds,
    delivery: result.delivery,
    previewCode: result.previewCode,
    message: result.delivery === "sms" ? "验证码已发送" : "预览环境验证码已生成",
  });
}
