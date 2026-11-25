import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { ensureMessagingIndexes } from "@/lib/messaging";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ deviceId: string }> };
const deviceIdSchema = z.string().uuid();

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const db = await ensureMessagingIndexes();
    const devices = await db.collection("e2eeDevices").find(
      { userId: user.id },
      { projection: {
        _id: 0,
        deviceId: 1,
        platform: 1,
        identityKeyType: 1,
        identityKeyFingerprint: 1,
        status: 1,
        createdAt: 1,
        lastSeenAt: 1,
        revokedAt: 1,
      } },
    ).sort({ createdAt: -1 }).limit(20).toArray();

    return NextResponse.json({ devices }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("E2EE device listing failed:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Could not load registered devices." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const rate = await consumeRateLimit(`e2ee-device-revoke:${user.id}`, 10, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many device revocation attempts." }, { status: 429 });

    const { deviceId } = await context.params;
    if (!deviceIdSchema.safeParse(deviceId).success) {
      return NextResponse.json({ error: "A valid device ID is required." }, { status: 400 });
    }

    const db = await ensureMessagingIndexes();
    const now = new Date();
    const result = await db.collection("e2eeDevices").updateOne(
      { userId: user.id, deviceId, status: "active" },
      { $set: { status: "revoked", revokedAt: now, updatedAt: now } },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Active device not found." }, { status: 404 });
    }

    return NextResponse.json({
      revoked: true,
      deviceId,
      revokedAt: now,
      note: "The device record is marked revoked. E2EE transport does not yet enforce device-bound request signatures, and native key deletion or MLS group membership updates are not implemented; this is not yet effective cryptographic revocation.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("E2EE device revocation failed:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Could not revoke device." }, { status: 503 });
  }
}
