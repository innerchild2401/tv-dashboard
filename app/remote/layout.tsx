import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { RemoteProvider } from "@/components/remote/provider";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { loadRemoteBoard } from "@/lib/remote/board";
import "./remote.css";

export const metadata: Metadata = {
  title: "Tablou",
  applicationName: "Tablou",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tablou", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0D1117",
};

export const dynamic = "force-dynamic";

export default async function RemoteLayout({ children }: { children: ReactNode }) {
  const secret = process.env.SESSION_SECRET ?? "";
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const initial = secret && verifySession(token, secret) ? await loadRemoteBoard().catch(() => null) : null;
  return <RemoteProvider initial={initial}>{children}</RemoteProvider>;
}
