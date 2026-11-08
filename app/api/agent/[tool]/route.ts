import { handleAgentHttp } from "@/lib/agent/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Context = { params: Promise<{ tool: string }> };

export async function POST(request: Request, context: Context) {
  const { tool } = await context.params;
  return handleAgentHttp(request, tool);
}
