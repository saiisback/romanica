import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearer, hasScope, resolveProject } from "./auth.ts";
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
    const scope = scopeFor(c.req.method, new URL(c.req.url).pathname);
    if (!hasScope(project, scope)) return c.json({ error: "forbidden", requiredScope: scope }, 403);
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

function scopeFor(method: string, pathname: string): string {
  if (pathname.startsWith("/v1/traces") && method === "POST") return "traces:write";
  if (pathname.startsWith("/v1/traces") || pathname.startsWith("/v1/analytics")) return "traces:read";
  if (pathname.startsWith("/v1/routing")) return method === "GET" ? "routing:read" : "routing:write";
  if (pathname.startsWith("/v1/evaluations")) return "evaluations:read";
  if (pathname.startsWith("/v1/audit")) return "audit:read";
  if (pathname.startsWith("/v1/agents") || pathname.startsWith("/v1/runs")) {
    return method === "GET" ? "runtime:read" : "runtime:write";
  }
  if (pathname.startsWith("/v1/workflows") || pathname.startsWith("/v1/workflow-runs")) {
    return method === "GET" ? "workflows:read" : "workflows:write";
  }
  if (pathname.startsWith("/v1/memories")) return method === "GET" ? "memories:read" : "memories:write";
  if (pathname.startsWith("/v1/pools") || pathname.startsWith("/v1/autoscaling")) {
    return method === "GET" ? "scaling:read" : "scaling:write";
  }
  if (pathname.startsWith("/v1/messages")) return method === "GET" ? "messages:read" : "messages:write";
  if (pathname.startsWith("/v1/approvals")) return method === "GET" ? "approvals:read" : "approvals:write";
  if (pathname.startsWith("/v1/policies")) return "governance:write";
  return "platform:write";
}

export const app = createApp();
export type AppType = ReturnType<typeof createApp>;
