import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGmailClientForMcp } from "../auth/gmail-client.js";
import { toolSpecs } from "../tools/registry.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "gmail-mcp", version: "0.1.0" });

  for (const spec of toolSpecs) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.shape },
      async (input: unknown) => {
        try {
          const gmail = await getGmailClientForMcp();
          const result = await spec.handler(gmail, input as never);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
        }
      }
    );
  }

  return server;
}
