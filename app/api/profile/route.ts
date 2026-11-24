import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  avatarUrl: z.union([
    z.string().trim().url().max(2048).refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "Avatar URL must use HTTPS."),
    z.literal(""),
    z.null(),
  ]).optional(),
}).strict();

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const limit = await consumeRateLimit(`profile-update:${user.id}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many profile updates. Try again shortly." }, { status: 429 });
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile details." }, { status: 400 });
    }

    const db = await getDb();
    const update: { displayName: string; avatarUrl?: string | null; updatedAt: Date } = {
      displayName: parsed.data.displayName,
      updatedAt: new Date(),
    };
    if (parsed.data.avatarUrl !== undefined) {
      update.avatarUrl = parsed.data.avatarUrl || null;
    }

    const result = await db.collection("users").findOneAndUpdate(
      { _id: new ObjectId(user.id) },
      { $set: update },
      { returnDocument: "after", projection: { phone: 1, displayName: 1, avatarUrl: 1, createdAt: 1 } },
    );
    if (!result) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: result._id.toString(),
        phone: String(result.phone),
        displayName: typeof result.displayName === "string" ? result.displayName : "",
        avatarUrl: typeof result.avatarUrl === "string" ? result.avatarUrl : "",
      },
    });
  } catch (error) {
    console.error("Profile update failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not update your profile." }, { status: 503 });
  }
}
