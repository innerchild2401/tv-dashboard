import { broadcastChanged } from "@/lib/realtime/publish";

export async function publishChange(): Promise<boolean> {
  try {
    return await broadcastChanged();
  } catch {
    return false;
  }
}
