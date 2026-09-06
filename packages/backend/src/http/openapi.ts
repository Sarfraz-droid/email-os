import { loadConfig } from "../config.js";

/**
 * Hand-written OpenAPI 3.1 document describing the backend HTTP surface.
 * Served at GET /openapi.json and rendered by Scalar at GET /docs.
 */
export function buildOpenApiDocument() {
  const config = loadConfig();
  const port = config.server.port;

  return {
    openapi: "3.1.0",
    info: {
      title: "Gmail OS Backend",
      version: "0.0.1",
      description:
        "HTTP surface for the Gmail OS backend: health check, Google sign-in, session-scoped " +
        "conversations, and a streaming chat endpoint that drives an OpenRouter-backed agent " +
        "using each signed-in user's Gmail. Auth is a session cookie set by the sign-in flow.",
    },
    servers: [{ url: `http://localhost:${port}`, description: "Local development" }],
    paths: {
      "/health": {
        get: {
          operationId: "getHealth",
          summary: "Health check",
          description: "Returns service liveness and whether a Gmail account is currently connected.",
          tags: ["System"],
          responses: {
            "200": {
              description: "Service is up",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "authenticated", "gmailConnected"],
                    properties: {
                      ok: { type: "boolean", const: true },
                      authenticated: { type: "boolean" },
                      gmailConnected: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/google/start": {
        get: {
          operationId: "startLogin",
          summary: "Begin Google sign-in",
          description:
            "Sets a short-lived state cookie and redirects (302) to Google's consent screen " +
            "for OpenID identity + Gmail access. `/oauth/start` is a back-compat alias.",
          tags: ["Auth"],
          responses: {
            "302": {
              description: "Redirect to Google's OAuth consent screen",
              headers: {
                Location: { schema: { type: "string", format: "uri" } },
              },
            },
          },
        },
      },
      "/auth/logout": {
        post: {
          operationId: "logout",
          summary: "Destroy the current session",
          tags: ["Auth"],
          responses: {
            "200": {
              description: "Session cleared",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { ok: { type: "boolean" } } },
                },
              },
            },
          },
        },
      },
      "/api/me": {
        get: {
          operationId: "getMe",
          summary: "Current user",
          description: "Returns the signed-in user and whether their Gmail is connected. 401 if no session.",
          tags: ["Auth"],
          responses: {
            "200": {
              description: "The signed-in user",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "401": { description: "Not authenticated" },
          },
        },
      },
      "/api/conversations": {
        get: {
          operationId: "listConversations",
          summary: "List the user's conversations",
          tags: ["Chat"],
          responses: {
            "200": {
              description: "Conversation summaries, newest first",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "401": { description: "Not authenticated" },
          },
        },
      },
      "/api/conversations/{id}": {
        get: {
          operationId: "getConversation",
          summary: "Get a conversation's transcript",
          tags: ["Chat"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Conversation summary + UI transcript",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "401": { description: "Not authenticated" },
            "404": { description: "Not found or not owned by the user" },
          },
        },
        delete: {
          operationId: "deleteConversation",
          summary: "Delete a conversation",
          tags: ["Chat"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Deleted" },
            "401": { description: "Not authenticated" },
            "404": { description: "Not found or not owned by the user" },
          },
        },
      },
      "/oauth/callback": {
        get: {
          operationId: "oauthCallback",
          summary: "Google OAuth redirect URI",
          description:
            "Google redirects here with an authorization `code` and `state`. The code is exchanged " +
            "for tokens; the user is upserted, their Gmail tokens stored, a session created, and the " +
            "browser redirected to the app. Not called directly by clients.",
          tags: ["Auth"],
          parameters: [
            {
              name: "code",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Authorization code returned by Google on success.",
            },
            {
              name: "error",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Error code returned by Google when consent fails or is denied.",
            },
          ],
          responses: {
            "200": {
              description: "Gmail account connected",
              content: { "text/html": { schema: { type: "string" } } },
            },
            "400": {
              description: "Missing code or Google returned an error",
              content: { "text/html": { schema: { type: "string" } } },
            },
            "500": {
              description: "Token exchange failed",
              content: { "text/html": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/api/chat": {
        post: {
          operationId: "postChat",
          summary: "Stream a chat turn",
          description:
            "Runs one turn of the chat agent and streams progress as Server-Sent Events. " +
            "Each SSE `event` is one of `text`, `tool_call`, `tool_result`, `error`, `done`; " +
            "the `data` field is a JSON-encoded payload matching the `ChatEvent` union.",
          tags: ["Chat"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChatRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "SSE stream of ChatEvent objects",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string",
                    description: "Sequence of SSE frames, one JSON-encoded ChatEvent per frame.",
                  },
                },
              },
            },
            "400": {
              description: "Invalid request body",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { error: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ChatRequest: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string", description: "User message for this turn." },
            conversationId: {
              type: "string",
              description:
                "Conversation to continue. Omit to start a new one; the server creates it and " +
                "emits a `conversation` SSE event with its id and title.",
            },
          },
        },
      },
    },
    tags: [
      { name: "System", description: "Liveness and status." },
      { name: "Auth", description: "Google sign-in, sessions, current user." },
      { name: "Chat", description: "Streaming chat agent and conversation history." },
    ],
  } as const;
}
