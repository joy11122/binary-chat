import { describe, expect, it } from "vitest";
import { sendOtpSchema, verifyOtpSchema } from "@/lib/validation/auth";

describe("phone authentication validation", () => {
  it("normalizes a Bangladesh phone number to E.164", () => {
    expect(sendOtpSchema.parse({ phone: "01712345678" }).phone).toBe("+8801712345678");
  });

  it("accepts a valid international phone number", () => {
    expect(sendOtpSchema.parse({ phone: "+8801712345678" }).phone).toBe("+8801712345678");
  });

  it("rejects invalid phone numbers", () => {
    expect(sendOtpSchema.safeParse({ phone: "123" }).success).toBe(false);
  });

  it("requires a six-digit OTP", () => {
    expect(verifyOtpSchema.safeParse({ phone: "+8801712345678", code: "123456" }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ phone: "+8801712345678", code: "1234" }).success).toBe(false);
  });
});
