import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AppConfig {
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  openRouter: {
    apiKey: string;
    model: string;
    baseUrl: string;
  };
  server: {
    port: number;
  };
  app: {
    /** Frontend origin: post-login redirect target, CORS allow-origin, cookie scope. */
    baseUrl: string;
  };
  database: {
    url: string;
    /** Optional path to a CA bundle for `sslmode=verify-full`. */
    caCert?: string;
  };
  session: {
    ttlDays: number;
  };
  /** 32+ random bytes. When set, Gmail tokens are encrypted at rest. */
  appSecret?: string;
  /** Legacy single-account token file; still used by the MCP server as a fallback. */
  tokenFilePath: string;
  /** Which stored account the stdio MCP server should act as (email match). */
  mcpAccountEmail?: string;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  cached = {
    google: {
      clientId: required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
      redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:8787/oauth/callback",
    },
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5",
      baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    },
    server: {
      port: Number(process.env.PORT ?? 8787),
    },
    app: {
      baseUrl: (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, ""),
    },
    database: {
      // Resolved lazily by requireDatabaseUrl() so `mcp` mode can run without it.
      url: process.env.DATABASE_URL ?? "",
      caCert: process.env.DATABASE_CA_CERT || undefined,
    },
    session: {
      ttlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
    },
    appSecret: process.env.APP_SECRET || undefined,
    tokenFilePath: process.env.TOKEN_FILE_PATH ?? "./data/token.json",
    mcpAccountEmail: process.env.MCP_ACCOUNT_EMAIL || undefined,
  };
  return cached;
}

/** Throws a clear error if DATABASE_URL is missing (serve / migrate modes need it). */
export function requireDatabaseUrl(): string {
  const url = loadConfig().database.url;
  if (!url) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL (needed for the HTTP server and migrations)"
    );
  }
  return url;
}

/** OAuth scopes: OpenID Connect identity + full Gmail access, granted in one consent. */
export const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://mail.google.com/",
];
