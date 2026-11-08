import { authorizeAgent, bearerToken } from "@/lib/agent/auth";
import { executeTool } from "@/lib/agent/tools";
import { json } from "@/lib/remote/http";

export async function handleAgentHttp(request: Request, tool: string): Promise<Response> {
  const auth = authorizeAgent(bearerToken(request));
  if (!auth.ok) return json({ ok: false, id: null, warnings: [], reason: auth.reason }, auth.status);
  if (request.method !== "POST") return json({ ok: false, id: null, warnings: [], reason: "use POST" }, 405);
  const text = await request.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return json({ ok: false, id: null, warnings: [], reason: "the body must be JSON" }, 400);
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, id: null, warnings: [], reason: "the body must be a JSON object" }, 400);
  }
  const result = await executeTool(tool, body);
  return json(result, statusFor(result.reason));
}

function statusFor(reason: string | undefined): number {
  if (reason === "unknown tool") return 404;
  if (reason === "too many requests, try again in a minute") return 429;
  if (reason === "the dashboard database is not configured" || reason === "the dashboard could not check the rate limit") return 503;
  return 200;
}
