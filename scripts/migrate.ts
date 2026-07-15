/**
 * Applies scripts/schema.sql to the Neon database.
 *
 *   npm run migrate
 *
 * Every statement in the schema is idempotent (create ... if not exists), so this
 * is safe to run repeatedly. Uses the unpooled connection — DDL should not go
 * through the pgbouncer pooler.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL(_UNPOOLED) is not set. Add it to .env.local.");
}

/** Split the file into individual statements. The schema uses no dollar-quoting or
 *  string literals, so stripping every `--` comment (a comment can itself contain a
 *  ';') and then splitting on ';' is safe. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, "")) // drop inline + full-line comments
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const sql = neon(url!);
  const schema = readFileSync(join(process.cwd(), "scripts", "schema.sql"), "utf8");
  const stmts = statements(schema);

  console.log(`Applying ${stmts.length} statement(s) to Neon…`);
  for (const stmt of stmts) {
    const label = stmt.split("\n")[0].slice(0, 70);
    await sql.query(stmt);
    console.log(`  ✓ ${label}`);
  }
  console.log("✓ Schema is up to date.");
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
