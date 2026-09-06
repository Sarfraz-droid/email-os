import OpenAI from "openai";
import { loadConfig } from "../config.js";

let client: OpenAI | undefined;

export function getLlmClient(): OpenAI {
  if (client) return client;
  const config = loadConfig();
  if (!config.openRouter.apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }
  client = new OpenAI({
    apiKey: config.openRouter.apiKey,
    baseURL: config.openRouter.baseUrl,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/email-os",
      "X-Title": "Gmail OS",
    },
  });
  return client;
}
