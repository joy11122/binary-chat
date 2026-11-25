import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { ensureMessagingIndexes } from "@/lib/messaging";
import { verifyDeviceEnrollmentProof } from "@/lib/e2ee/device-enrollment";

export const runtime = "nodejs";

const requestSchema = z.object({
  challengeId: z.string().regex(/^[a-f\d]{24}$/i),
  deviceId: z.string().uuid(),
  publicKey: z.string().min(40).max(400),
  signature: z.string().min(80).max(100),
}).strict();

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const rate = await consumeRateLimit(`e2ee-device-register:${user.id}`, 5, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many device enrollment attempts." }, { status: 429 });

    const body: unknown = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid device enrollment proof." }, { status: 400 });

    const db = await ensureMessagingIndexes();
    const challenges = db.collection("e2eeDeviceEnrollmentChallenges");
    const challenge = await challenges.findOne({
      _id: new ObjectId(parsed.data.challengeId),
      userId: user.id,
      deviceId: parsed.data.deviceId,
      expiresAt: { $gt: new Date() },
    });
    if (!challenge) return NextResponse.json({ error: "Enrollment challenge is missing, expired, or belongs to another device." }, { status: 410 });

    const valid = verifyDeviceEnrollmentProof({
      userId: user.id,
      deviceId: parsed.data.deviceId,
      challenge: challenge.challenge,
      publicKey: parsed.data.publicKey,
      signature: parsed.data.signature,
    });
    if (!valid) return NextResponse.json({ error: "Device identity signature is invalid." }, { status: 401 });

    const consumed = await challenges.findOneAndDelete({
      _id: challenge._id,
      userId: user.id,
      deviceId: parsed.data.deviceId,
      expiresAt: { $gt: new Date() },
    });
    if (!consumed) return NextResponse.json({ error: "Enrollment challenge has already been used." }, { status: 409 });

    const now = new Date();
    const fingerprint = createHash("sha256")
      .update(Buffer.from(parsed.data.publicKey, "base64url"))
      .digest("hex");

    try {
      await db.collection("e2eeDevices").createIndex(
        { userId: 1, deviceId: 1 },
        { unique: true, name: "e2ee_device_user_device_unique" },
      );
      await db.collection("e2eeDevices").createIndex(
        { userId: 1, status: 1, createdAt: -1 },
        { name: "e2ee_devices_user_status_created" },
      );
      await db.collection("e2eeDevices").insertOne({
        userId: user.id,
        deviceId: parsed.data.deviceId,
        platform: challenge.platform,
        identityKeyType: "Ed25519",
        identityPublicKey: parsed.data.publicKey,
        identityKeyFingerprint: fingerprint,
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        return NextResponse.json({ error: "This device is already registered. Revoke it before enrolling it again." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({
      device: {
        deviceId: parsed.data.deviceId,
        platform: challenge.platform,
        identityKeyType: "Ed25519",
        identityKeyFingerprint: fingerprint,
        status: "active",
        createdAt: now,
      },
      nextStep: "MLS key-package publication is not enabled until the native OpenMLS runtime and secure persistence are approved.",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("E2EE device registration failed:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Could not register E2EE device." }, { status: 503 });
  }
}
