import { broadcastChangedUrl, realtimeChannelName } from "@/lib/realtime/channel";

export async function broadcastChanged(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.SESSION_SECRET;
  if (!url || !key || !secret) return false;

  try {
    const response = await fetch(broadcastChangedUrl(url, realtimeChannelName(secret)), {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    return response.status === 202;
  } catch {
    return false;
  }
}
