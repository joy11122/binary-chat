import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { verifyOtpSchema } from "@/lib/validation/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { verifyPhoneOtp } from "@/lib/auth/otp-provider";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = verifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid verification details." }, { status: 400 });
    }

    const { phone, code } = parsed.data;
    const ip = clientIp(request);
    const [phoneLimit, ipLimit] = await Promise.all([
      consumeRateLimit(`otp-verify-phone:${phone}`, 5, 15 * 60 * 1000),
      consumeRateLimit(`otp-verify-ip:${ip}`, 20, 15 * 60 * 1000),
    ]);
    if (!phoneLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: "Too many verification attempts. Request a new code later." }, { status: 429 });
    }

    const approved = await verifyPhoneOtp(phone, code);
    if (!approved) {
      return NextResponse.json({ error: "That code is invalid or expired." }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date();
    let userId: ObjectId | undefined;
    try {
      const result = await db.collection("users").findOneAndUpdate(
        { phone },
        { $set: { phone, lastLoginAt: now, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true, returnDocument: "after" },
      );
      if (result?._id instanceof ObjectId) userId = result._id;
    } catch (databaseError) {
      if (typeof databaseError === "object" && databaseError !== null && "code" in databaseError && databaseError.code === 11000) {
        const existing = await db.collection("users").findOne({ phone }, { projection: { _id: 1 } });
        if (existing?._id instanceof ObjectId) userId = existing._id;
      } else {
        throw databaseError;
      }
    }
    if (!(userId instanceof ObjectId)) {
      return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
    }

    await createSession(userId.toString());
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("OTP verification failed:", error instanceof Error ? error.message : "Unknown error");
    if (error instanceof Error && error.message === "OTP_PROVIDER_ERROR") {
      return NextResponse.json({ error: "Verification is temporarily unavailable." }, { status: 502 });
    }
    return NextResponse.json({ error: "Authentication service is temporarily unavailable." }, { status: 503 });
  }
}
