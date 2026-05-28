/** Centralised, validated-ish environment config. */
export const env = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://romanica:romanica@127.0.0.1:5433/romanica",
  port: Number(process.env.API_PORT ?? 4000),

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "romanica-traces",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "romanica",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "romanica123",
  },

  /** Inline payloads up to this many bytes in Postgres; offload larger to S3. */
  inlineBlobLimitBytes: Number(process.env.INLINE_BLOB_LIMIT ?? 16_000),
};
