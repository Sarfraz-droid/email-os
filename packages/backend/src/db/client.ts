import { readFileSync } from "node:fs";
import postgres from "postgres";
import { loadConfig, requireDatabaseUrl } from "../config.js";

export type Sql = ReturnType<typeof postgres>;

let cached: Sql | undefined;

/**
 * Singleton Postgres/CockroachDB connection pool.
 *
 * The connection string's `sslmode` is honoured (CockroachDB Cloud uses
 * `verify-full`). Managed clusters present a publicly-trusted certificate, so no
 * CA file is normally needed; set `DATABASE_CA_CERT` to a bundle path if yours
 * requires one.
 */
export function db(): Sql {
  if (cached) return cached;

  const url = requireDatabaseUrl();
  const { database } = loadConfig();
  const sslmode = new URL(url).searchParams.get("sslmode") ?? "verify-full";

  let ssl: postgres.Options<{}>["ssl"];
  if (sslmode === "disable") {
    ssl = false;
  } else if (database.caCert) {
    ssl = { ca: readFileSync(database.caCert, "utf8"), rejectUnauthorized: true };
  } else if (sslmode === "verify-full" || sslmode === "verify-ca") {
    ssl = "verify-full";
  } else {
    ssl = "require";
  }

  cached = postgres(url, {
    ssl,
    max: 10,
    idle_timeout: 30,
    connect_timeout: 15,
    // CockroachDB is happiest without the connection-time type introspection query.
    fetch_types: false,
    // CockroachDB emits chatty NOTICE lines for every DDL job; the schema is
    // idempotent and re-run on boot, so drop them.
    onnotice: () => {},
  });
  return cached;
}

export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = undefined;
  }
}
