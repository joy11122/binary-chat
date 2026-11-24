import { describe, expect, it } from "vitest";
import { conversationChannel, isObjectId, normalizeMemberKey } from "./messaging";

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
