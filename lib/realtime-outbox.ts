import { randomUUID } from "node:crypto";
import type { Db, Document } from "mongodb";
import { conversationChannel, getAblyRest } from "@/lib/messaging";

const LEASE_MS = 30_000;
const MAX_RETRY_MS = 15 * 60_000;

export function realtimeRetryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(1_000 * 2 ** Math.min(safeAttempt - 1, 10), MAX_RETRY_MS);
}

export function buildMessageCreatedEvent(message: Document) {
  return {
    id: String(message._id),
    conversationId: String(message.conversationId),
    text: String(message.text),
    senderId: String(message.senderId),
    recipientId: String(message.recipientId),
    createdAt: message.createdAt,
    clientMessageId: String(message.clientMessageId),
  };
}

export type RealtimeOutboxDrainResult = {
  attempted: number;
  published: number;
  deferred: number;
};

export async function drainRealtimeOutbox(db: Db, limit = 50): Promise<RealtimeOutboxDrainResult> {
  const result: RealtimeOutboxDrainResult = { attempted: 0, published: 0, deferred: 0 };
  const messages = db.collection<Document>("messages");

  for (let index = 0; index < Math.max(1, Math.min(100, Math.floor(limit))); index += 1) {
    const leaseToken = randomUUID();
    const claimedAt = new Date();
    const claimed = await messages.findOneAndUpdate(
      {
        realtimePending: true,
        $and: [
          { $or: [{ realtimeNextAttemptAt: { $exists: false } }, { realtimeNextAttemptAt: { $lte: claimedAt } }] },
          { $or: [{ realtimeLeaseUntil: { $exists: false } }, { realtimeLeaseUntil: { $lte: claimedAt } }] },
        ],
      },
      {
        $set: {
          realtimeLeaseToken: leaseToken,
          realtimeLeaseUntil: new Date(claimedAt.getTime() + LEASE_MS),
        },
        $inc: { realtimeAttempts: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );

    if (!claimed) break;
    result.attempted += 1;
    const attempts = Number(claimed.realtimeAttempts ?? 1);

    try {
      await getAblyRest().channels.get(conversationChannel(String(claimed.conversationId))).publish(
        "message.created",
        buildMessageCreatedEvent(claimed),
      );
      const marked = await messages.updateOne(
        { _id: claimed._id, realtimeLeaseToken: leaseToken, realtimePending: true },
        {
          $set: { realtimePublishedAt: new Date(), realtimePending: false },
          $unset: { realtimeLeaseToken: "", realtimeLeaseUntil: "", realtimeNextAttemptAt: "", realtimeLastError: "" },
        },
      );
      if (marked.modifiedCount === 1) result.published += 1;
    } catch (error) {
      await messages.updateOne(
        { _id: claimed._id, realtimeLeaseToken: leaseToken, realtimePending: true },
        {
          $set: {
            realtimeNextAttemptAt: new Date(Date.now() + realtimeRetryDelayMs(attempts)),
            realtimeLastError: error instanceof Error ? error.message.slice(0, 300) : "Realtime provider error",
          },
          $unset: { realtimeLeaseToken: "", realtimeLeaseUntil: "" },
        },
      );
      result.deferred += 1;
    }
  }

  return result;
}
