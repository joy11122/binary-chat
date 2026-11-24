import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureMessagingIndexes, getAblyRest, conversationChannel } from "@/lib/messaging";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const db = await ensureMessagingIndexes();
    const conversations = await db.collection("conversations").find(
      { memberIds: user.id }, { projection: { _id: 1 }, limit: 200 },
    ).toArray();
    const capability: Record<string, string[]> = {};
    for (const conversation of conversations) {
      capability[conversationChannel(conversation._id.toString())] = ["subscribe", "presence"];
    }
    const tokenRequest = await getAblyRest().auth.createTokenRequest({
      clientId: user.id,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000,
    });
    return NextResponse.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Realtime token request failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Realtime service is not configured or is temporarily unavailable." }, { status: 503 });
  }
}
