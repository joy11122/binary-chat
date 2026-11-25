import { z } from "zod";

export const MAX_CIPHERTEXT_CHARS = 180_000;

export const encryptedMessageEnvelopeSchema = z.object({
  protocol: z.literal("MLS"),
  version: z.literal(1),
  clientMessageId: z.string().uuid(),
  epoch: z.number().int().nonnegative().safe(),
  ciphertext: z.string()
    .min(1)
    .max(MAX_CIPHERTEXT_CHARS)
    .regex(/^[A-Za-z0-9_-]+$/, "Ciphertext must be unpadded base64url.")
    .refine((value) => value.length % 4 !== 1, "Ciphertext has an invalid base64url length."),
}).strict();

export type EncryptedMessageEnvelope = z.infer<typeof encryptedMessageEnvelopeSchema>;
