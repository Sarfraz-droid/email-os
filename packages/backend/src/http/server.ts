import { Hono } from "hono";
import { cors } from "hono/cors";
import { oauthRoutes } from "./routes/oauth.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { conversationRoutes } from "./routes/conversations.js";
import { docsRoutes } from "./routes/docs.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { optionalAuth, type AuthVars } from "./middleware/require-auth.js";
import { hasGmailAccount } from "../db/gmail-accounts.js";
import { ensureSchema } from "../db/migrate.js";
import { loadConfig } from "../config.js";

export function createHttpApp() {
  const app = new Hono<{ Variables: Partial<AuthVars> }>();
  const { app: appCfg } = loadConfig();

  app.use("*", cors({ origin: appCfg.baseUrl, credentials: true }));

  app.get("/health", optionalAuth, async (c) => {
    const user = c.get("user");
    return c.json({
      ok: true,
      authenticated: Boolean(user),
      gmailConnected: user ? await hasGmailAccount(user.id) : false,
    });
  });

  app.route("/", oauthRoutes);
  app.route("/", authRoutes);
  app.route("/", chatRoutes);
  app.route("/", conversationRoutes);
  app.route("/", attachmentRoutes);
  app.route("/", docsRoutes);

  return app;
}

export async function startHttpServer(): Promise<void> {
  const config = loadConfig();
  await ensureSchema();
  const app = createHttpApp();
  Bun.serve({ port: config.server.port, fetch: app.fetch });
  console.log(`Gmail OS backend listening on http://localhost:${config.server.port}`);
  console.log(`Sign in: http://localhost:${config.server.port}/auth/google/start`);
  console.log(`API reference (Scalar): http://localhost:${config.server.port}/docs`);
}
