import { randomUUID } from "node:crypto";
import type { Db, Document, ObjectId } from "mongodb";
import { conversationChannel, getAblyRest } from "@/lib/messaging";
import { buildMessageCreatedEvent, buildReceiptEvent, realtimeRetryDelayMs } from "@/lib/realtime-outbox-utils";

const LEASE_MS = 30_000;
export type RealtimeOutboxDrainResult = {
  attempted: number;
  published: number;
  deferred: number;
};

async function drainReceiptOutbox(
  db: Db,
  kind: "delivery" | "read",
  limit: number,
  result: RealtimeOutboxDrainResult,
): Promise<void> {
  const messages = db.collection<Document>("messages");
  const pendingField = kind === "delivery" ? "deliveryReceiptPending" : "readReceiptPending";
  const prefix = kind === "delivery" ? "deliveryReceipt" : "readReceipt";

  for (let index = 0; index < limit; index += 1) {
    const leaseToken = randomUUID();
    const claimedAt = new Date();
    const claimed = await messages.findOneAndUpdate(
      {
        [pendingField]: true,
        $and: [
          { $or: [{ [`${prefix}NextAttemptAt`]: { $exists: false } }, { [`${prefix}NextAttemptAt`]: { $lte: claimedAt } }] },
          { $or: [{ [`${prefix}LeaseUntil`]: { $exists: false } }, { [`${prefix}LeaseUntil`]: { $lte: claimedAt } }] },
        ],
      },
      {
        $set: {
          [`${prefix}LeaseToken`]: leaseToken,
          [`${prefix}LeaseUntil`]: new Date(claimedAt.getTime() + LEASE_MS),
        },
        $inc: { [`${prefix}Attempts`]: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );

    if (!claimed) break;
    result.attempted += 1;
    const attempts = Number(claimed[`${prefix}Attempts`] ?? 1);
    try {
      const receipt = buildReceiptEvent(kind, claimed);
      await getAblyRest().channels.get(conversationChannel(String(claimed.conversationId))).publish(receipt.name, receipt.payload);
      const marked = await messages.updateOne(
        { _id: claimed._id, [`${prefix}LeaseToken`]: leaseToken, [pendingField]: true },
        {
          $set: { [`${prefix}PublishedAt`]: new Date(), [pendingField]: false },
          $unset: {
            [`${prefix}LeaseToken`]: "",
            [`${prefix}LeaseUntil`]: "",
            [`${prefix}NextAttemptAt`]: "",
            [`${prefix}LastError`]: "",
          },
        },
      );
      if (marked.modifiedCount === 1) result.published += 1;
    } catch (error) {
      await messages.updateOne(
        { _id: claimed._id, [`${prefix}LeaseToken`]: leaseToken, [pendingField]: true },
        {
          $set: {
            [`${prefix}NextAttemptAt`]: new Date(Date.now() + realtimeRetryDelayMs(attempts)),
            [`${prefix}LastError`]: error instanceof Error ? error.name.slice(0, 80) : "Realtime provider error",
          },
          $unset: { [`${prefix}LeaseToken`]: "", [`${prefix}LeaseUntil`]: "" },
        },
      );
      result.deferred += 1;
    }
  }
}

export async function drainRealtimeOutbox(db: Db, limit = 50, onlyMessageId?: ObjectId): Promise<RealtimeOutboxDrainResult> {
  const result: RealtimeOutboxDrainResult = { attempted: 0, published: 0, deferred: 0 };
  const messages = db.collection<Document>("messages");
  const batchLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  for (let index = 0; index < batchLimit; index += 1) {
    const leaseToken = randomUUID();
    const claimedAt = new Date();
    const claimed = await messages.findOneAndUpdate(
      {
        ...(onlyMessageId ? { _id: onlyMessageId } : {}),
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
            realtimeLastError: error instanceof Error ? error.name.slice(0, 80) : "Realtime provider error",
          },
          $unset: { realtimeLeaseToken: "", realtimeLeaseUntil: "" },
        },
      );
      result.deferred += 1;
    }
  }

  if (!onlyMessageId && result.attempted < batchLimit) {
    const remaining = batchLimit - result.attempted;
    await drainReceiptOutbox(db, "delivery", remaining, result);
    if (result.attempted < batchLimit) {
      await drainReceiptOutbox(db, "read", batchLimit - result.attempted, result);
    }
  }

  return result;
}
