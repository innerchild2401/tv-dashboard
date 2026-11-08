import { createHash } from "node:crypto";
import { tokensMatch } from "@/lib/auth/tv";

export type AgentAuth =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: string };

export function authorizeAgent(provided: string): AgentAuth {
  const expected = process.env.AGENT_TOKEN ?? "";
  if (!expected) return { ok: false, status: 503, reason: "agent access is not configured" };
  if (!provided || !tokensMatch(provided, expected)) {
    return { ok: false, status: 401, reason: "agent token is invalid" };
  }
  return { ok: true };
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? "";
}

export function argsHash(tool: string, args: unknown): string {
  return createHash("sha256").update(stableJson({ tool, args: args ?? {} })).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) next[key] = sortKeys(record[key]);
  return next;
}
