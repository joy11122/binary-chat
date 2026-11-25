import { describe, expect, it } from "vitest";
import { encryptedMessageEnvelopeSchema, MAX_CIPHERTEXT_CHARS } from "./envelope";

const validEnvelope = {
  protocol: "MLS",
  version: 1,
  clientMessageId: "b8b9c56d-2c1d-4e5f-8b50-f8c1c1a6b4e1",
  epoch: 0,
  ciphertext: "AQIDBA",
};

describe("MLS ciphertext envelope validation", () => {
  it("accepts a versioned opaque MLS ciphertext envelope", () => {
    expect(encryptedMessageEnvelopeSchema.parse(validEnvelope)).toEqual(validEnvelope);
  });

  it("rejects plaintext fields instead of silently stripping them", () => {
    expect(encryptedMessageEnvelopeSchema.safeParse({
      ...validEnvelope,
      text: "this must never reach the encrypted transport",
    }).success).toBe(false);
  });

  it("rejects envelopes without ciphertext", () => {
    const { ciphertext: _ciphertext, ...withoutCiphertext } = validEnvelope;
    expect(encryptedMessageEnvelopeSchema.safeParse(withoutCiphertext).success).toBe(false);
  });

  it("rejects non-base64url ciphertext and impossible encoded lengths", () => {
    expect(encryptedMessageEnvelopeSchema.safeParse({ ...validEnvelope, ciphertext: "abc+/" }).success).toBe(false);
    expect(encryptedMessageEnvelopeSchema.safeParse({ ...validEnvelope, ciphertext: "a" }).success).toBe(false);
    expect(encryptedMessageEnvelopeSchema.safeParse({ ...validEnvelope, ciphertext: "ab=" }).success).toBe(false);
  });

  it("rejects unsafe, negative, and non-integer MLS epochs", () => {
    for (const epoch of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]) {
      expect(encryptedMessageEnvelopeSchema.safeParse({ ...validEnvelope, epoch }).success).toBe(false);
    }
  });

  it("enforces the ciphertext size ceiling", () => {
    expect(encryptedMessageEnvelopeSchema.safeParse({
      ...validEnvelope,
      ciphertext: "A".repeat(MAX_CIPHERTEXT_CHARS),
    }).success).toBe(true);
    expect(encryptedMessageEnvelopeSchema.safeParse({
      ...validEnvelope,
      ciphertext: "A".repeat(MAX_CIPHERTEXT_CHARS + 1),
    }).success).toBe(false);
  });

  it("rejects unsupported protocol and envelope versions", () => {
    expect(encryptedMessageEnvelopeSchema.safeParse({ ...validEnvelope, protocol: "custom" }).success).toBe(false);
    expect(encryptedMessageEnvelopeSchema.safeParse({ ...validEnvelope, version: 2 }).success).toBe(false);
  });
});
