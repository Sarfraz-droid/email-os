export {};

const mode = process.argv[2];

if (mode === "mcp") {
  const { runStdioServer } = await import("./mcp/stdio-entry.js");
  await runStdioServer();
} else if (mode === "migrate") {
  const { runMigrate } = await import("./db/migrate.js");
  await runMigrate();
} else if (mode === "serve" || !mode) {
  const { startHttpServer } = await import("./http/server.js");
  await startHttpServer();
} else {
  console.error(`Unknown mode "${mode}". Use "serve", "mcp", or "migrate".`);
  process.exit(1);
}
