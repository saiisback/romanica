import { afterAll, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";
import { sql } from "../src/db.ts";

const app = createApp();
const key = `rom_scope_${crypto.randomUUID()}`;

afterAll(async () => {
  await sql`DELETE FROM projects WHERE api_key = ${key}`;
});

test("API key scopes are enforced by route family", async () => {
  await sql`
    INSERT INTO projects (name, api_key, api_scopes)
    VALUES ('scoped-test', ${key}, ARRAY['traces:read']::text[])
  `;

  const read = await app.request("/v1/traces?limit=1", {
    headers: { authorization: `Bearer ${key}` },
  });
  expect(read.status).toBe(200);

  const write = await app.request("/v1/memories", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      kind: "fact",
      key: "blocked",
      content: { ok: false },
    }),
  });
  expect(write.status).toBe(403);
  expect(await write.json()).toMatchObject({ error: "forbidden", requiredScope: "memories:write" });
});
