import { createHash } from "node:crypto";

export function realtimeChannelName(secret: string): string {
  const digest = createHash("sha256").update(`tv-changed:${secret}`).digest("hex");
  return `tv_${digest.slice(0, 24)}`;
}

export function realtimeClientConfig(): { url: string; anonKey: string; channel: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SESSION_SECRET;
  if (!url || !anonKey || !secret) return null;
  return { url: url.replace(/\/$/, ""), anonKey, channel: realtimeChannelName(secret) };
}

export function broadcastChangedUrl(supabaseUrl: string, channel: string): string {
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/realtime/v1/api/broadcast/${encodeURIComponent(channel)}/events/changed`;
}
