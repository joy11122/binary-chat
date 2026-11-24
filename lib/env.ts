import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().url(),
  MONGODB_DB_NAME: z.string().min(1).refine((value) => !value.includes("."), "MongoDB database names cannot contain dots."),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must contain at least 32 characters."),
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC"),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_VERIFY_SERVICE_SID: z.string().startsWith("VA"),
});

export function getServerEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Server environment is incomplete: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}
