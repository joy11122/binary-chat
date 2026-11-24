import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import PhoneAuthForm from "@/components/auth/phone-auth-form";

export const metadata: Metadata = { title: "Sign in — Binary Chat", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <PhoneAuthForm />;
}
