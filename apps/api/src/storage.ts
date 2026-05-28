import { S3Client } from "bun";
import { env } from "./env.ts";

/** S3-compatible object store (MinIO in dev) for large span payloads. */
const s3 = new S3Client({
  accessKeyId: env.s3.accessKeyId,
  secretAccessKey: env.s3.secretAccessKey,
  region: env.s3.region,
  endpoint: env.s3.endpoint,
  bucket: env.s3.bucket,
});

export interface BlobField {
  /** small payload kept inline in Postgres (jsonb), else null */
  inline: unknown | null;
  /** object-store key when offloaded, else null */
  ref: string | null;
}

/**
 * Decide whether a span payload is inlined in Postgres or offloaded to S3.
 * Keeps the relational store fast; big prompts/returns live in the object store.
 */
export async function storeBlob(
  value: unknown,
  key: string,
): Promise<BlobField> {
  if (value === undefined) return { inline: null, ref: null };

  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, "utf8") <= env.inlineBlobLimitBytes) {
    return { inline: value, ref: null };
  }

  await s3.write(key, json, { type: "application/json" });
  return { inline: null, ref: key };
}

/** Fetch an offloaded payload back (used by the query API). */
export async function readBlob(ref: string): Promise<unknown> {
  const text = await s3.file(ref).text();
  return JSON.parse(text) as unknown;
}
