import { describe, expect, it } from "vitest";
import { conversationChannel, isObjectId, normalizeMemberKey } from "./messaging-utils";
import { buildMessageCreatedEvent, realtimeRetryDelayMs } from "./realtime-outbox-utils";

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
});
