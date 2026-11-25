import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  createDeviceEnrollmentChallenge,
  deviceEnrollmentSigningPayload,
  verifyDeviceEnrollmentProof,
} from "./device-enrollment";

describe("E2EE device enrollment proof", () => {
  it("verifies a challenge signed by the device Ed25519 identity key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const input = {
      userId: "user-123",
      deviceId: "4f87b5d2-0c11-4e0a-a4e7-b8d1a7c9f1c2",
      challenge: createDeviceEnrollmentChallenge(),
      publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64url"),
    };
    const signature = sign(null, deviceEnrollmentSigningPayload(input), privateKey).toString("base64url");

    expect(verifyDeviceEnrollmentProof({ ...input, signature })).toBe(true);
    expect(verifyDeviceEnrollmentProof({ ...input, signature, userId: "another-user" })).toBe(false);
    expect(verifyDeviceEnrollmentProof({ ...input, signature, deviceId: "another-device" })).toBe(false);
  });

  it("rejects malformed keys, non-Ed25519 keys, and malformed signatures", () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rsaPublicKey = publicKey.export({ format: "der", type: "spki" }).toString("base64url");
    const base = {
      userId: "user-123",
      deviceId: "4f87b5d2-0c11-4e0a-a4e7-b8d1a7c9f1c2",
      challenge: createDeviceEnrollmentChallenge(),
      signature: "AA",
    };
    expect(verifyDeviceEnrollmentProof({ ...base, publicKey: "not-base64url!" })).toBe(false);
    expect(verifyDeviceEnrollmentProof({ ...base, publicKey: rsaPublicKey })).toBe(false);
    expect(verifyDeviceEnrollmentProof({ ...base, publicKey: "AA", signature: "AA" })).toBe(false);
  });
});
