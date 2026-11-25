import { createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";

export const DEVICE_ENROLLMENT_DOMAIN = "binary-chat-e2ee-device-enrollment:v1";

export function createDeviceEnrollmentChallenge() {
  return randomBytes(32).toString("base64url");
}

export function deviceEnrollmentSigningPayload(input: {
  userId: string;
  deviceId: string;
  challenge: string;
}) {
  return Buffer.from(
    [DEVICE_ENROLLMENT_DOMAIN, input.userId, input.deviceId, input.challenge].join("\n"),
    "utf8",
  );
}

export function verifyDeviceEnrollmentProof(input: {
  userId: string;
  deviceId: string;
  challenge: string;
  publicKey: string;
  signature: string;
}): boolean {
  try {
    const publicKeyBytes = Buffer.from(input.publicKey, "base64url");
    const signatureBytes = Buffer.from(input.signature, "base64url");
    if (
      publicKeyBytes.length < 32 ||
      publicKeyBytes.length > 256 ||
      signatureBytes.length !== 64 ||
      publicKeyBytes.toString("base64url") !== input.publicKey ||
      signatureBytes.toString("base64url") !== input.signature
    ) return false;

    const key = createPublicKey({
      key: publicKeyBytes,
      format: "der",
      type: "spki",
    });
    if (key.asymmetricKeyType !== "ed25519") return false;

    return verifySignature(
      null,
      deviceEnrollmentSigningPayload(input),
      key,
      signatureBytes,
    );
  } catch {
    return false;
  }
}
