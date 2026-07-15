import { neon } from "@neondatabase/serverless";

/**
 * Neon Postgres client. The `sql` tagged template safely parameterises values:
 *
 *   const rows = await sql`select * from users where id = ${id}`;
 *
 * We use the HTTP driver (no pooling, no persistent socket) which is the right
 * fit for serverless request handlers on Vercel — every query is a single fetch.
 * The pooled DATABASE_URL is correct here; the migration script uses the unpooled
 * one for DDL.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set — add it to .env.local (see .env.example).");
}

export const sql = neon(url);
