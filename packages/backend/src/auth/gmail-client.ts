import { google, type gmail_v1 } from "googleapis";
import { getValidAccessToken, getValidAccessTokenForMcp } from "./token-store.js";

/** Gmail client for a signed-in web user. */
export async function getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
  const auth = await getValidAccessToken(userId);
  return google.gmail({ version: "v1", auth });
}

/** Gmail client for the single-account stdio MCP server. */
export async function getGmailClientForMcp(): Promise<gmail_v1.Gmail> {
  const auth = await getValidAccessTokenForMcp();
  return google.gmail({ version: "v1", auth });
}
