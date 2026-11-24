import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Binary Chat — Private conversations, reimagined",
  description: "A calmer, privacy-first messaging experience with a binary display mode.",
  applicationName: "Binary Chat",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Binary Chat" },
};

export const viewport: Viewport = { themeColor: "#09140F", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
