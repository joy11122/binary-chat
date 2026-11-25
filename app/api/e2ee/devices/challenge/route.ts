import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { ensureMessagingIndexes } from "@/lib/messaging";
import {
  createDeviceEnrollmentChallenge,
  deviceEnrollmentSigningPayload,
} from "@/lib/e2ee/device-enrollment";

export const runtime = "nodejs";

const requestSchema = z.object({
  deviceId: z.string().uuid(),
  platform: z.enum(["android", "ios"]),
}).strict();

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const rate = await consumeRateLimit(`e2ee-device-challenge:${user.id}`, 5, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many device enrollment attempts." }, { status: 429 });

    const body: unknown = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "A valid native device ID and platform are required." }, { status: 400 });

    const db = await ensureMessagingIndexes();
    await db.collection("e2eeDeviceEnrollmentChallenges").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "e2ee_device_challenge_expiry" },
    );

    const now = new Date();
    const challenge = createDeviceEnrollmentChallenge();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    const challengeId = new ObjectId();
    const signingPayload = deviceEnrollmentSigningPayload({
      userId: user.id,
      deviceId: parsed.data.deviceId,
      challenge,
    });

    await db.collection("e2eeDeviceEnrollmentChallenges").insertOne({
      _id: challengeId,
      userId: user.id,
      deviceId: parsed.data.deviceId,
      platform: parsed.data.platform,
      challenge,
      createdAt: now,
      expiresAt,
    });

    return NextResponse.json({
      challengeId: challengeId.toString(),
      challenge,
      signingPayload: signingPayload.toString("base64url"),
      expiresAt,
      algorithm: "Ed25519",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("E2EE device challenge failed:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Could not create device enrollment challenge." }, { status: 503 });
  }
}
