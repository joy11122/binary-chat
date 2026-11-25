import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureMessagingIndexes } from "@/lib/messaging";
import { drainRealtimeOutbox } from "@/lib/realtime-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const db = await ensureMessagingIndexes();
    const result = await drainRealtimeOutbox(db, 50);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Realtime outbox drain failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Realtime delivery recovery failed." }, { status: 503 });
  }
}
