import { createMcpHandler } from "mcp-handler";
import { authorizeAgent, bearerToken } from "@/lib/agent/auth";
import { executeTool, TOOL_CATALOG } from "@/lib/agent/tools";
import { json } from "@/lib/remote/http";

const handler = createMcpHandler(
  (server) => {
    for (const tool of TOOL_CATALOG) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.input,
        },
        async (args) => {
          const result = await executeTool(tool.name, args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            isError: !result.ok,
          };
        },
      );
    }
  },
  {
    serverInfo: { name: "tv-dashboard", version: "0.4.0" },
  },
);

export async function handleMcp(request: Request): Promise<Response> {
  const auth = authorizeAgent(bearerToken(request));
  if (!auth.ok) return json({ ok: false, id: null, warnings: [], reason: auth.reason }, auth.status);
  return handler(request);
}
