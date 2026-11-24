import { NextResponse } from "next/server";
import { sendOtpSchema } from "@/lib/validation/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { sendPhoneOtp } from "@/lib/auth/otp-provider";
import { getClientIp } from "@/lib/auth/request";

export const runtime = "nodejs";



export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = sendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid phone number." }, { status: 400 });
    }

    const phone = parsed.data.phone;
    const ip = getClientIp(request);
    const [phoneLimit, ipLimit] = await Promise.all([
      consumeRateLimit(`otp-send-phone:${phone}`, 3, 15 * 60 * 1000),
      consumeRateLimit(`otp-send-ip:${ip}`, 10, 15 * 60 * 1000),
    ]);
    if (!phoneLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: "Too many code requests. Please try again later." }, { status: 429 });
    }

    await sendPhoneOtp(phone);
    return NextResponse.json({ success: true, message: "Verification code sent." });
  } catch (error) {
    console.error("OTP send failed:", error instanceof Error ? error.message : "Unknown error");
    if (error instanceof Error && error.message === "OTP_PROVIDER_ERROR") {
      return NextResponse.json({ error: "We could not send a code right now. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ error: "Authentication service is temporarily unavailable." }, { status: 503 });
  }
}
