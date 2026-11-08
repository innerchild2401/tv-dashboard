const NAMED: Record<string, string> = {
  teal: "#5EEAD4",
  sand: "#FFD166",
  coral: "#FF8A7A",
  lilac: "#C4B5FD",
  mint: "#6EE7B7",
  sky: "#7DD3FC",
  pink: "#F9A8D4",
};

export const ACCENT_CHOICES = [
  { id: "teal", color: NAMED.teal },
  { id: "sand", color: NAMED.sand },
  { id: "coral", color: NAMED.coral },
  { id: "lilac", color: NAMED.lilac },
  { id: "mint", color: NAMED.mint },
  { id: "sky", color: NAMED.sky },
  { id: "pink", color: NAMED.pink },
] as const;

export function accentColor(value: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase();
  return NAMED[value] ?? NAMED.teal;
}
