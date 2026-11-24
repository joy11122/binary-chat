import { describe, expect, it } from "vitest";
import { deleteAccountSchema } from "./account";

describe("account deletion validation", () => {
  it("requires the exact DELETE confirmation phrase", () => {
    expect(deleteAccountSchema.safeParse({ confirmation: "DELETE" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirmation: "delete" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirmation: "DELETE " }).success).toBe(false);
  });

  it("rejects unexpected fields", () => {
    expect(deleteAccountSchema.safeParse({ confirmation: "DELETE", userId: "attacker" }).success).toBe(false);
  });
});
