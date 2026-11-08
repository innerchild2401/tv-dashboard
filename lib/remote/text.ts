export function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
}

export function plainData(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      next[key] = plainText(value);
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = value.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const record: Record<string, unknown> = {};
        for (const [childKey, child] of Object.entries(item as Record<string, unknown>)) {
          record[childKey] = typeof child === "string" ? plainText(child) : child;
        }
        return record;
      });
      continue;
    }
    next[key] = value;
  }
  return next;
}
