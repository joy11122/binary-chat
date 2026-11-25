import Ably from "ably";
import { ObjectId } from "mongodb";
export { conversationChannel, isObjectId, normalizeMemberKey } from "./messaging-utils";
import { getDb } from "@/lib/db";

export type DirectConversation = {
  _id: ObjectId;
  memberIds: string[];
  memberKey: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
};

export async function ensureMessagingIndexes() {
  const db = await getDb();
  await Promise.all([
    db.collection("conversations").createIndex({ memberKey: 1 }, { unique: true, name: "direct_conversation_members_unique" }),
    db.collection("conversations").createIndex({ memberIds: 1, updatedAt: -1 }, { name: "conversation_members_updated" }),
    db.collection("messages").createIndex({ conversationId: 1, createdAt: -1 }, { name: "messages_conversation_created" }),
    db.collection("messages").createIndex({ conversationId: 1, senderId: 1, clientMessageId: 1 }, { unique: true, name: "message_idempotency_unique" }),
    db.collection("messages").createIndex({ recipientId: 1, deliveredAt: 1 }, { name: "messages_pending_delivery" }),
    db.collection("messages").createIndex({ conversationId: 1, recipientId: 1, readAt: 1, createdAt: -1 }, { name: "messages_conversation_unread" }),
    db.collection("messages").createIndex({ realtimePending: 1, realtimeNextAttemptAt: 1, realtimeLeaseUntil: 1, createdAt: 1 }, { name: "messages_realtime_outbox" }),
    db.collection("messages").createIndex({ deliveryReceiptPending: 1, deliveryReceiptNextAttemptAt: 1, deliveryReceiptLeaseUntil: 1, createdAt: 1 }, { name: "messages_delivery_receipt_outbox" }),
    db.collection("messages").createIndex({ readReceiptPending: 1, readReceiptNextAttemptAt: 1, readReceiptLeaseUntil: 1, createdAt: 1 }, { name: "messages_read_receipt_outbox" }),
    db.collection("e2eeMessages").createIndex({ conversationId: 1, createdAt: -1, _id: -1 }, { name: "e2ee_messages_conversation_created" }),
    db.collection("e2eeMessages").createIndex({ conversationId: 1, senderId: 1, clientMessageId: 1 }, { unique: true, name: "e2ee_message_idempotency_unique" }),
  ]);
  return db;
}

export function getAblyRest() {
  const key = process.env.ABLY_API_KEY;
  if (!key) throw new Error("REALTIME_PROVIDER_NOT_CONFIGURED");
  return new Ably.Rest({ key });
}
