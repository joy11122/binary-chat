import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { ensureMessagingIndexes, normalizeMemberKey } from "@/lib/messaging";

export const runtime = "nodejs";
const createSchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) });

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const db = await ensureMessagingIndexes();
    const conversations = await db.collection("conversations").aggregate([
      { $match: { memberIds: user.id } },
      { $sort: { updatedAt: -1 } },
      { $limit: 100 },
      { $lookup: { from: "users", let: { members: "$memberIds" }, pipeline: [
        { $match: { $expr: { $in: [{ $toString: "$_id" }, "$$members"] } } },
        { $project: { phone: 1, displayName: 1, avatarUrl: 1 } },
      ], as: "members" } },
      { $lookup: { from: "messages", let: { conversationId: "$_id" }, pipeline: [
        { $match: { $expr: { $eq: ["$conversationId", "$conversationId"] } } },
        { $sort: { createdAt: -1 } }, { $limit: 1 },
        { $project: { text: 1, senderId: 1, createdAt: 1 } },
      ], as: "latestMessage" } },
      { $lookup: { from: "messages", let: { conversationId: "$_id" }, pipeline: [
        { $match: {
          recipientId: user.id,
          readAt: { $exists: false },
          $expr: { $eq: ["$conversationId", "$conversationId"] },
        } },
        { $count: "total" },
      ], as: "unreadCount" } },
      { $project: { memberIds: 1, createdAt: 1, updatedAt: 1, members: 1, latestMessage: 1, unreadCount: 1 } },
    ]).toArray();
    return NextResponse.json({ conversations: conversations.map((item) => ({
      id: String(item._id),
      members: item.members.map((member: { _id: ObjectId; phone: string; displayName?: string; avatarUrl?: string }) => ({
        id: member._id.toString(), phone: member.phone, displayName: member.displayName ?? "", avatarUrl: member.avatarUrl ?? "",
      })),
      latestMessage: item.latestMessage?.[0] ? {
        text: item.latestMessage[0].text,
        senderId: item.latestMessage[0].senderId,
        createdAt: item.latestMessage[0].createdAt,
      } : null,
      unreadCount: item.unreadCount?.[0]?.total ?? 0,
      updatedAt: item.updatedAt,
    })) });
  } catch (error) {
    console.error("Conversation list failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not load conversations." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "A valid contact user ID is required." }, { status: 400 });
    const limit = await consumeRateLimit(`conversation-create:${user.id}`, 10, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many new conversations. Try again shortly." }, { status: 429 });
    if (parsed.data.userId === user.id) return NextResponse.json({ error: "You cannot start a conversation with yourself." }, { status: 400 });

    const db = await ensureMessagingIndexes();
    const other = await db.collection("users").findOne({ _id: new ObjectId(parsed.data.userId) }, { projection: { _id: 1 } });
    if (!other) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

    const memberIds = [user.id, parsed.data.userId].sort();
    const memberKey = normalizeMemberKey(memberIds);
    const now = new Date();
    const result = await db.collection("conversations").findOneAndUpdate(
      { memberKey },
      { $setOnInsert: { memberIds, memberKey, createdAt: now }, $set: { updatedAt: now } },
      { upsert: true, returnDocument: "after" },
    );
    if (!result) return NextResponse.json({ error: "Could not create conversation." }, { status: 500 });
    return NextResponse.json({ conversation: { id: result._id.toString(), memberIds: result.memberIds } }, { status: 200 });
  } catch (error) {
    console.error("Conversation create failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not create conversation." }, { status: 503 });
  }
}
