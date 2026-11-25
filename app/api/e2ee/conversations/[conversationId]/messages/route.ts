import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { conversationChannel, ensureMessagingIndexes, getAblyRest, isObjectId } from "@/lib/messaging";

export const runtime = "nodejs";

const MAX_CIPHERTEXT_CHARS = 180_000;
const sendSchema = z.object({
  protocol: z.literal("MLS"),
  version: z.literal(1),
  clientMessageId: z.string().uuid(),
  epoch: z.number().int().nonnegative(),
  ciphertext: z.string()
    .min(1)
    .max(MAX_CIPHERTEXT_CHARS)
    .regex(/^[A-Za-z0-9_-]+$/, "Ciphertext must be unpadded base64url."),
});

type RouteContext = { params: Promise<{ conversationId: string }> };

async function getMemberContext(conversationId: string, userId: string) {
  if (!isObjectId(conversationId)) return null;
  const db = await ensureMessagingIndexes();
  const conversation = await db.collection("conversations").findOne({
    _id: new ObjectId(conversationId),
    memberIds: userId,
  });
  return conversation ? { db, conversation } : null;
}

/**
 * E2EE-only transport endpoint.
 *
 * This route treats the MLS wire message as opaque bytes. It must never accept
 * plaintext, decrypt payloads, or fall back to the legacy plaintext collection.
 * The native MLS runtime is not enabled yet, so clients cannot use this endpoint
 * as proof that E2EE is available.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const limit = await consumeRateLimit(`e2ee-history:${user.id}`, 120, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many history requests." }, { status: 429 });

    const { conversationId } = await context.params;
    const access = await getMemberContext(conversationId, user.id);
    if (!access) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const filter: Record<string, unknown> = { conversationId: access.conversation._id };
    if (before) {
      const beforeDate = new Date(before);
      if (Number.isNaN(beforeDate.getTime())) {
        return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
      }
      filter.createdAt = { $lt: beforeDate };
    }

    const messages = await access.db.collection("e2eeMessages")
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      messages: messages.reverse().map((message) => ({
        id: String(message._id),
        conversationId: String(message.conversationId),
        senderId: message.senderId,
        recipientId: message.recipientId,
        protocol: message.protocol,
        version: message.version,
        epoch: message.epoch,
        ciphertext: message.ciphertext,
        clientMessageId: message.clientMessageId,
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error("E2EE message history failed:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Could not load encrypted messages." }, { status: 503 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const limit = await consumeRateLimit(`e2ee-send:${user.id}`, 60, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "You are sending encrypted messages too quickly." }, { status: 429 });

    const { conversationId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid encrypted message envelope." }, { status: 400 });
    }

    const access = await getMemberContext(conversationId, user.id);
    if (!access) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

    const recipientId = (access.conversation.memberIds as string[]).find((id) => id !== user.id);
    if (!recipientId) return NextResponse.json({ error: "Conversation recipient is unavailable." }, { status: 409 });

    const now = new Date();
    const collection = access.db.collection("e2eeMessages");
    const document = {
      conversationId: access.conversation._id,
      senderId: user.id,
      recipientId,
      protocol: parsed.data.protocol,
      version: parsed.data.version,
      epoch: parsed.data.epoch,
      ciphertext: parsed.data.ciphertext,
      clientMessageId: parsed.data.clientMessageId,
      createdAt: now,
    };

    let saved;
    try {
      saved = await collection.findOneAndUpdate(
        {
          conversationId: access.conversation._id,
          senderId: user.id,
          clientMessageId: parsed.data.clientMessageId,
        },
        { $setOnInsert: document },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
      saved = await collection.findOne({
        conversationId: access.conversation._id,
        senderId: user.id,
        clientMessageId: parsed.data.clientMessageId,
      });
    }
    if (!saved) return NextResponse.json({ error: "Encrypted message could not be saved." }, { status: 500 });

    await access.db.collection("conversations").updateOne(
      { _id: access.conversation._id },
      { $set: { updatedAt: now, lastMessageAt: now } },
    );

    const event = {
      id: String(saved._id),
      conversationId,
      senderId: user.id,
      recipientId,
      protocol: saved.protocol,
      version: saved.version,
      epoch: saved.epoch,
      ciphertext: saved.ciphertext,
      clientMessageId: saved.clientMessageId,
      createdAt: saved.createdAt,
    };

    // MongoDB remains the source of truth. If Ably is temporarily unavailable,
    // the client can recover the opaque envelope from GET history.
    try {
      await getAblyRest()
        .channels.get(conversationChannel(conversationId))
        .publish("e2ee.message.created", event);
    } catch (error) {
      console.error("E2EE realtime publish deferred to history sync:", error instanceof Error ? error.name : "Unknown error");
    }

    return NextResponse.json({ message: event }, { status: 201 });
  } catch (error) {
    console.error("E2EE message send failed:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Could not send encrypted message." }, { status: 503 });
  }
}
