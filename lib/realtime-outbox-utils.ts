import type { Document } from "mongodb";

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
