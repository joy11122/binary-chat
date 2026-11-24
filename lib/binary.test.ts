import { describe, expect, it } from "vitest";
import { binaryToText, textToBinary } from "./binary";

describe("UTF-8 binary conversion", () => {
  it("encodes ASCII as eight-bit byte groups", () => {
    expect(textToBinary("A")).toBe("01000001");
  });

  it("round-trips Bangla, English and emoji", () => {
    const message = "Hello বাংলাদেশ 👋🌿";
    expect(binaryToText(textToBinary(message))).toBe(message);
  });

  it("returns an empty string for malformed binary input", () => {
    expect(binaryToText("101")).toBe("");
    expect(binaryToText("0100000x")).toBe("");
  });
});
