/**
 * The rollback tool for the versioned manifest (photomapplan.md §6.1).
 *
 *   npm run revisions                     # list every manifest revision, newest first
 *   npm run revisions -- --rollback <key> # repoint latest.json at an older revision
 *
 * This is what makes "public writes + whole-file metadata" survivable: a bad or
 * malicious edit is undone by moving a pointer, not by restoring from nothing.
 */
import { config } from "dotenv";
import { listRevisions, rollbackTo, readManifest } from "../lib/manifest";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set. Run:  vercel link && vercel env pull .env.local");
  }

  const i = process.argv.indexOf("--rollback");
  if (i !== -1) {
    const key = process.argv[i + 1];
    if (!key) throw new Error("Usage: npm run revisions -- --rollback manifest/rev/<...>.json");
    await rollbackTo(key);
    console.log(`✓ latest.json now points at ${key}`);
    return;
  }

  const revs = await listRevisions();
  if (!revs.length) {
    console.log("No revisions yet.");
    return;
  }

  const current = await readManifest();
  console.log(`\n${revs.length} revision(s), newest first:\n`);
  revs.forEach((r, n) => console.log(`  ${n === 0 ? "→" : " "} ${r}`));
  console.log(
    `\nCurrent: ${current.collections.length} collection(s), ` +
      `${current.collections.reduce((n, c) => n + c.photos.length, 0)} photos, updated ${current.updatedAt}\n`,
  );
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
