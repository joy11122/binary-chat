import { NextResponse } from "next/server";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const rawPhone = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
    const parsed = parsePhoneNumberFromString(rawPhone, "BD");
    if (!parsed?.isValid()) return NextResponse.json({ error: "Enter a complete valid phone number." }, { status: 400 });
    const db = await getDb();
    const contact = await db.collection("users").findOne(
      { phone: parsed.number, _id: { $ne: currentUser.id } },
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
