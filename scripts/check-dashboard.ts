#!/usr/bin/env bun
// Smoke dashboard/API routes with the API and web dev servers already running.

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const routes = [
  "/",
  "/agents",
  "/runs",
  "/workflows",
  "/memories",
  "/pools",
  "/routing",
  "/evaluations",
  "/messages",
  "/approvals",
  "/audit",
  "/analytics",
];

async function check(url: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const text = await res.text();
  return text.length;
}

const health = await fetch(`${API_URL}/health`);
if (!health.ok) throw new Error(`${API_URL}/health -> ${health.status}`);
console.log(`api ${API_URL}/health ok`);

for (const route of routes) {
  const bytes = await check(`${WEB_URL}${route}`);
  console.log(`${route.padEnd(14)} ${bytes} bytes`);
}

console.log("dashboard smoke ok");
