import { SQL } from "bun";
import { env } from "./env.ts";

/** Single shared Postgres connection pool (Bun-native). */
export const sql = new SQL(env.databaseUrl);
