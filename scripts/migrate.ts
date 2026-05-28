#!/usr/bin/env bun
/**
 * Minimal forward-only migration runner (Bun-native Postgres).
 * Applies every db/migrations/*.sql not yet recorded in _migrations, in order,
 * each inside a transaction. Idempotent: re-running applies nothing new.
 *
 * Usage: bun run scripts/migrate.ts   (reads DATABASE_URL)
 */
import { SQL } from "bun";
import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://romanica:romanica@localhost:5432/romanica";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

const sql = new SQL(DATABASE_URL);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set<string>(
    (await sql`SELECT name FROM _migrations`).map((r: { name: string }) => r.name),
  );

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· skip   ${file}`);
      continue;
    }
    const text = await Bun.file(join(migrationsDir, file)).text();
    await sql.begin(async (tx) => {
      // .simple() runs the whole file (multiple statements) in one round-trip
      await tx.unsafe(text).simple();
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    console.log(`✓ applied ${file}`);
    count++;
  }

  console.log(count ? `\nApplied ${count} migration(s).` : "\nUp to date.");
  await sql.end();
}

main().catch(async (err) => {
  console.error("Migration failed:", err);
  await sql.end();
  process.exit(1);
});
