import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { conversationChannel, ensureMessagingIndexes, getAblyRest, isObjectId } from "@/lib/messaging";

export const runtime = "nodejs";
const sendSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  clientMessageId: z.string().uuid(),
});
type RouteContext = { params: Promise<{ conversationId: string }> };

async function getMemberContext(conversationId: string, userId: string) {
  if (!isObjectId(conversationId)) return null;
  const db = await ensureMessagingIndexes();
  const conversation = await db.collection("conversations").findOne({
    _id: new ObjectId(conversationId), memberIds: userId,
  });
  return conversation ? { db, conversation } : null;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const historyLimit = await consumeRateLimit(`message-history:${user.id}`, 120, 60_000);
    if (!historyLimit.allowed) return NextResponse.json({ error: "Too many history requests. Try again shortly." }, { status: 429 });
    const { conversationId } = await context.params;
    const access = await getMemberContext(conversationId, user.id);
    if (!access) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const filter: Record<string, unknown> = { conversationId: access.conversation._id };
    if (before && !Number.isNaN(Date.parse(before))) filter.createdAt = { $lt: new Date(before) };
    const messages = await access.db.collection("messages").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
    const delivered = await access.db.collection("messages").updateMany(
      { conversationId: access.conversation._id, recipientId: user.id, deliveredAt: { $exists: false } },
      { $set: { deliveredAt: new Date() } },
    );
    if (delivered.modifiedCount > 0) {
      try {
        await getAblyRest().channels.get(conversationChannel(conversationId)).publish("message.delivered", {
          recipientId: user.id, deliveredAt: new Date(),
        });
      } catch (error) {
        console.error("Delivery receipt realtime publish failed:", error instanceof Error ? error.message : "Unknown error");
      }
    }
    return NextResponse.json({ messages: messages.reverse().map((message) => ({
      id: message._id.toString(), text: message.text, senderId: message.senderId,
      recipientId: message.recipientId, createdAt: message.createdAt,
      deliveredAt: message.deliveredAt ?? null, readAt: message.readAt ?? null,
      clientMessageId: message.clientMessageId,
    })) });
  } catch (error) {
    console.error("Message history failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not load messages." }, { status: 503 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { conversationId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const limit = await consumeRateLimit(`message-send:${user.id}`, 60, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "You are sending messages too quickly. Try again shortly." }, { status: 429 });
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid message." }, { status: 400 });
    const access = await getMemberContext(conversationId, user.id);
    if (!access) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const recipientId = (access.conversation.memberIds as string[]).find((id) => id !== user.id);
    if (!recipientId) return NextResponse.json({ error: "Conversation recipient is unavailable." }, { status: 409 });

    const now = new Date();
    const message = {
      conversationId: access.conversation._id,
      senderId: user.id,
      recipientId,
      clientMessageId: parsed.data.clientMessageId,
      text: parsed.data.text,
      createdAt: now,
    };
    let saved;
    try {
      saved = await access.db.collection("messages").findOneAndUpdate(
        { conversationId: access.conversation._id, senderId: user.id, clientMessageId: parsed.data.clientMessageId },
        { $setOnInsert: message },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
      saved = await access.db.collection("messages").findOne({
        conversationId: access.conversation._id, senderId: user.id, clientMessageId: parsed.data.clientMessageId,
      });
    }
    if (!saved) return NextResponse.json({ error: "Message could not be saved." }, { status: 500 });
    await access.db.collection("conversations").updateOne(
      { _id: access.conversation._id }, { $set: { updatedAt: now, lastMessageAt: now } },
    );

    try {
      await getAblyRest().channels.get(conversationChannel(conversationId)).publish("message.created", {
        id: saved._id.toString(), conversationId, text: saved.text, senderId: user.id,
        recipientId, createdAt: saved.createdAt, clientMessageId: saved.clientMessageId,
      });
    } catch (error) {
      console.error("Realtime publish deferred; message remains persisted:", error instanceof Error ? error.message : "Unknown error");
    }

    return NextResponse.json({ message: {
      id: saved._id.toString(), text: saved.text, senderId: saved.senderId,
      recipientId: saved.recipientId, createdAt: saved.createdAt,
      clientMessageId: saved.clientMessageId,
    } }, { status: 201 });
  } catch (error) {
    console.error("Message send failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not send message." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const receiptLimit = await consumeRateLimit(`message-read:${user.id}`, 120, 60_000);
    if (!receiptLimit.allowed) return NextResponse.json({ error: "Too many receipt updates. Try again shortly." }, { status: 429 });
    const { conversationId } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const schema = z.object({ messageIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(50) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Provide valid message IDs." }, { status: 400 });
    const access = await getMemberContext(conversationId, user.id);
    if (!access) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const ids = [...new Set(parsed.data.messageIds)].map((id) => new ObjectId(id));
    const unreadMessages = await access.db.collection("messages").find(
      { _id: { $in: ids }, conversationId: access.conversation._id, recipientId: user.id, readAt: { $exists: false } },
      { projection: { _id: 1 } },
    ).toArray();
    const eligibleIds = unreadMessages.map((message) => message._id);
    const now = new Date();
    const result = eligibleIds.length
      ? await access.db.collection("messages").updateMany(
          { _id: { $in: eligibleIds }, conversationId: access.conversation._id, recipientId: user.id, readAt: { $exists: false } },
          { $set: { readAt: now, deliveredAt: now } },
        )
      : { modifiedCount: 0 };
    if (eligibleIds.length > 0) {
      try {
        await getAblyRest().channels.get(conversationChannel(conversationId)).publish("message.read", {
          messageIds: eligibleIds.map((id) => id.toString()), readerId: user.id, readAt: now,
        });
      } catch (error) {
        console.error("Read receipt realtime publish failed:", error instanceof Error ? error.message : "Unknown error");
      }
    }
    return NextResponse.json({ updated: result.modifiedCount, readAt: now });
  } catch {
    return NextResponse.json({ error: "Could not update read receipts." }, { status: 503 });
  }
}
