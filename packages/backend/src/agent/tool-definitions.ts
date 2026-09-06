import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type OpenAI from "openai";
import type { gmail_v1 } from "googleapis";
import type { ToolResultPayload } from "@email-os/shared";
import { toolSpecs, findTool } from "../tools/registry.js";

export const openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = toolSpecs.map((spec) => ({
  type: "function",
  function: {
    name: spec.name,
    description: spec.description,
    parameters: zodToJsonSchema(z.object(spec.shape), { target: "openApi3" }) as Record<string, unknown>,
  },
}));

export async function dispatchTool(
  gmail: gmail_v1.Gmail,
  name: string,
  input: unknown
): Promise<ToolResultPayload> {
  const spec = findTool(name);
  if (!spec) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const parsed = z.object(spec.shape).parse(input ?? {});
  return spec.handler(gmail, parsed as never);
}
