import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const limit = await consumeRateLimit(`contact-lookup:${currentUser.id}`, 20, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many contact lookups. Try again shortly." }, { status: 429 });
    const rawPhone = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
    const parsed = parsePhoneNumberFromString(rawPhone, "BD");
    if (!parsed?.isValid()) return NextResponse.json({ error: "Enter a complete valid phone number." }, { status: 400 });
    const db = await getDb();
    const contact = await db.collection("users").findOne(
      { phone: parsed.number, _id: { $ne: new ObjectId(currentUser.id) } },
      { projection: { phone: 1, displayName: 1, avatarUrl: 1 } },
    );
    if (!contact || contact._id.toString() === currentUser.id) return NextResponse.json({ contact: null });
    return NextResponse.json({ contact: {
      id: contact._id.toString(), phone: contact.phone,
      displayName: typeof contact.displayName === "string" ? contact.displayName : "",
      avatarUrl: typeof contact.avatarUrl === "string" ? contact.avatarUrl : "",
    } });
  } catch {
    return NextResponse.json({ error: "Contact lookup is temporarily unavailable." }, { status: 503 });
  }
}
