import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearer, resolveProject } from "./auth.ts";
import { ingestRoutes } from "./routes/ingest.ts";
import { queryRoutes } from "./routes/query.ts";
import { replayRoutes } from "./routes/replay.ts";
import type { Env } from "./http.ts";

export function createApp() {
  const app = new Hono<Env>();

  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true, service: "romanica-api" }));

  // API-key auth for everything under /v1
  app.use("/v1/*", async (c, next) => {
    const project = await resolveProject(bearer(c.req.header("authorization")));
    if (!project) return c.json({ error: "unauthorized" }, 401);
    c.set("project", project);
    await next();
  });

  app.route("/", ingestRoutes);
  app.route("/", queryRoutes);
  app.route("/", replayRoutes);

  // never leak stack traces; observability backend must stay up
  app.onError((err, c) => {
    console.error("[api] unhandled error:", err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

export const app = createApp();
export type AppType = ReturnType<typeof createApp>;
