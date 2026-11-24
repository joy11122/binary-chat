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
  ]);
  return db;
}

export function getAblyRest() {
  const key = process.env.ABLY_API_KEY;
  if (!key) throw new Error("REALTIME_PROVIDER_NOT_CONFIGURED");
  return new Ably.Rest({ key });
}
