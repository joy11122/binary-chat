import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser, clearSession } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { ensureMessagingIndexes } from "@/lib/messaging";
import { deleteAccountSchema } from "@/lib/validation/account";

export const runtime = "nodejs";

/** Permanently deletes the authenticated account and its direct-message history. */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const limit = await consumeRateLimit(`account-delete:${user.id}`, 2, 60 * 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "Account deletion was already attempted. Try again later." }, { status: 429 });

    const body: unknown = await request.json().catch(() => null);
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Type DELETE exactly to confirm permanent account deletion." }, { status: 400 });
    }

    const db = await ensureMessagingIndexes();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const userId = user.id;
        const conversations = await db.collection("conversations").find(
          { memberIds: userId }, { projection: { _id: 1 }, session },
        ).toArray();
        const conversationIds = conversations.map((conversation) => conversation._id);

        await db.collection("messages").deleteMany(
          { $or: [
            { senderId: userId },
            { recipientId: userId },
            ...(conversationIds.length ? [{ conversationId: { $in: conversationIds } }] : []),
          ] },
          { session },
        );
        await db.collection("conversations").deleteMany({ memberIds: userId }, { session });
        const deleted = await db.collection("users").deleteOne({ _id: new ObjectId(userId) }, { session });
        if (deleted.deletedCount !== 1) throw new Error("ACCOUNT_DELETE_USER_NOT_FOUND");
      });
    } finally {
      await session.endSession();
    }

    await clearSession();
    return NextResponse.json({ success: true, message: "Your account and associated chat history have been permanently deleted." });
  } catch (error) {
    console.error("Account deletion failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not delete your account. No changes were confirmed; please try again." }, { status: 503 });
  }
}
