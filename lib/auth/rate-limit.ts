import { getDb } from "@/lib/db";

type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

/** Fixed-window counter stored atomically in MongoDB. */
export async function consumeRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult> {
  const db = await getDb();
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const resetAt = new Date((bucket + 1) * windowMs);
  const id = `${key}:${bucket}`;
  const collection = db.collection<{ _id: string; count: number; expiresAt: Date }>("auth_rate_limits");
  const record = await collection.findOneAndUpdate(
    { _id: id },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt.getTime() + windowMs) } },
    { upsert: true, returnDocument: "after" },
  );
  const count = record?.count ?? maxAttempts + 1;
  return { allowed: count <= maxAttempts, remaining: Math.max(0, maxAttempts - count), resetAt };
}
