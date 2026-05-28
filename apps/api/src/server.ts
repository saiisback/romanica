import { app } from "./app.ts";
import { env } from "./env.ts";

const server = Bun.serve({
  port: env.port,
  fetch: app.fetch,
  idleTimeout: 30,
});

console.log(`romanica-api listening on http://localhost:${server.port}`);
