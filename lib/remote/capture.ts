export const DESTINATIONS = ["auto", "task", "shopping", "idea"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export function parseDestination(value: unknown): Destination | null {
  return DESTINATIONS.includes(value as Destination) ? (value as Destination) : null;
}

export function shareText(title: string, text: string, url: string): string {
  return [title, text, url]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 500);
}
