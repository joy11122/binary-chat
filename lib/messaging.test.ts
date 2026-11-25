import { describe, expect, it } from "vitest";
import { conversationChannel, isObjectId, normalizeMemberKey } from "./messaging-utils";
import { buildMessageCreatedEvent, buildReceiptEvent, realtimeRetryDelayMs } from "./realtime-outbox-utils";
import { offlineMessageKey } from "./offline-message-queue";

describe("messaging helpers", () => {
  it("creates stable member keys regardless of input order", () => {
    expect(normalizeMemberKey(["b", "a"])).toBe("a:b");
    expect(normalizeMemberKey(["a", "b"])).toBe("a:b");
  });

  it("creates a namespaced conversation channel", () => {
    expect(conversationChannel("abc123")).toBe("conversation:abc123");
  });

  it("validates canonical MongoDB ObjectId strings", () => {
    expect(isObjectId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isObjectId("not-an-object-id")).toBe(false);
    expect(isObjectId("507F1F77BCF86CD799439011")).toBe(false);
  });
});

describe("realtime outbox helpers", () => {
  it("uses capped exponential retry delays", () => {
    expect(realtimeRetryDelayMs(1)).toBe(1_000);
    expect(realtimeRetryDelayMs(2)).toBe(2_000);
    expect(realtimeRetryDelayMs(5)).toBe(16_000);
    expect(realtimeRetryDelayMs(99)).toBe(15 * 60_000);
    expect(realtimeRetryDelayMs(0)).toBe(1_000);
  });

  it("builds a stable message.created payload for deduplication", () => {
    const createdAt = new Date("2026-11-25T12:00:00.000Z");
    expect(buildMessageCreatedEvent({
      _id: "message-1",
      conversationId: "conversation-1",
      text: "hello",
      senderId: "sender-1",
      recipientId: "recipient-1",
      createdAt,
      clientMessageId: "client-1",
    })).toEqual({
      id: "message-1",
      conversationId: "conversation-1",
      text: "hello",
      senderId: "sender-1",
      recipientId: "recipient-1",
      createdAt,
      clientMessageId: "client-1",
    });
  });

  it("builds durable delivery and read receipt event payloads", () => {
    const deliveredAt = new Date("2026-11-25T12:01:00.000Z");
    const readAt = new Date("2026-11-25T12:02:00.000Z");
    const message = { _id: "message-2", recipientId: "recipient-1", deliveredAt, readAt };
    expect(buildReceiptEvent("delivery", message)).toEqual({
      name: "message.delivered",
      payload: { messageIds: ["message-2"], recipientId: "recipient-1", deliveredAt },
    });
    expect(buildReceiptEvent("read", message)).toEqual({
      name: "message.read",
      payload: { messageIds: ["message-2"], readerId: "recipient-1", readAt },
    });
  });
});

describe("offline message queue helpers", () => {
  it("scopes queued message keys by user, conversation, and client message ID", () => {
    const base = { userId: "user-1", conversationId: "conversation-1", clientMessageId: "client-1" };
    expect(offlineMessageKey(base)).toBe("user-1:conversation-1:client-1");
    expect(offlineMessageKey({ ...base, userId: "user-2" })).not.toBe(offlineMessageKey(base));
    expect(offlineMessageKey({ ...base, conversationId: "conversation-2" })).not.toBe(offlineMessageKey(base));
  });
});
