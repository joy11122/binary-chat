import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

const COOKIE_NAME = "binary_chat_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secretKey() {
  return new TextEncoder().encode(getServerEnv().SESSION_SECRET);
}

export type SessionClaims = { userId: string };

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionClaims(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const claims = await getSessionClaims();
  if (!claims || !ObjectId.isValid(claims.userId)) return null;
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(claims.userId) },
    { projection: { phone: 1, displayName: 1, avatarUrl: 1, createdAt: 1 } },
  );
  if (!user) return null;
  return {
    id: user._id.toString(),
    phone: String(user.phone),
    displayName: typeof user.displayName === "string" ? user.displayName : "",
    avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : "",
  };
}
