import { redirect } from "next/navigation";
import ChatApp from "@/components/chat-app";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatApp displayName={user.displayName || user.phone} userId={user.id} />;
}
