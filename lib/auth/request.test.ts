import { describe, expect, it } from "vitest";
import { getClientIp } from "./request";

describe("trusted client IP extraction", () => {
  it("uses the reverse-proxy supplied x-real-ip header", () => {
    const request = new Request("https://example.test", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.99, 203.0.113.10",
      },
    });
    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("does not trust a client-supplied x-forwarded-for value", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });
    expect(getClientIp(request)).toBe("unknown");
  });

  it("normalizes a missing or whitespace-only trusted header", () => {
    expect(getClientIp(new Request("https://example.test"))).toBe("unknown");
    const request = new Request("https://example.test", { headers: { "x-real-ip": "   " } });
    expect(getClientIp(request)).toBe("unknown");
  });
});
