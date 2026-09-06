import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db } from "./client.js";

const SCHEMA_PATH = fileURLToPath(new URL("./schema.sql", import.meta.url));

let ensured: Promise<void> | undefined;

/** Runs the idempotent schema. Cached so repeated calls in one process are cheap. */
export function ensureSchema(): Promise<void> {
  if (!ensured) ensured = runSchema();
  return ensured;
}

async function runSchema(): Promise<void> {
  const sql = await readFile(SCHEMA_PATH, "utf8");
  // CockroachDB accepts multiple statements in one simple-query call.
  await db().unsafe(sql);
}

/** `bun run src/index.ts migrate` entrypoint. */
export async function runMigrate(): Promise<void> {
  await runSchema();
  console.log("Schema applied.");
  await db().end({ timeout: 5 });
}
