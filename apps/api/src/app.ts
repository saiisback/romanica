import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearer, resolveProject } from "./auth.ts";
import { approvalRoutes } from "./routes/approvals.ts";
import { ingestRoutes } from "./routes/ingest.ts";
import { memoryRoutes } from "./routes/memories.ts";
import { messageRoutes } from "./routes/messages.ts";
import { poolRoutes } from "./routes/pools.ts";
import { queryRoutes } from "./routes/query.ts";
import { replayRoutes } from "./routes/replay.ts";
import { runtimeRoutes } from "./routes/runtime.ts";
import { workflowRoutes } from "./routes/workflows.ts";
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

  app.route("/", approvalRoutes);
  app.route("/", ingestRoutes);
  app.route("/", memoryRoutes);
  app.route("/", messageRoutes);
  app.route("/", poolRoutes);
  app.route("/", workflowRoutes);
  app.route("/", runtimeRoutes);
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
