/**
 * Fails if docs/schema.dbml and the generated SQL have drifted apart.
 *
 * Three audits in a row found the same class of bug: a decision applied in one file and
 * not the other. This makes that checkable instead of hoped-for. Run it before starting
 * any phase that touches the schema.
 *
 *   node scripts/check-schema-drift.mjs
 */
import { readFileSync } from "node:fs";

// Words that appear in dbml prose (Note blocks) and are not column names.
const NOISE = new Set(["the","so","in","and","by","collection","recompute","residual",
  "editing","falling","agreement","v_ledger_reconciliation","plus","across","alert","not",
  "edited","grace","cron","storing","status"]);

const dbml = readFileSync(new URL("../../docs/schema.dbml", import.meta.url), "utf8");
const sql = readFileSync(new URL("../drizzle/0000_initial_schema.sql", import.meta.url), "utf8");

const spec = new Map();
for (const m of dbml.matchAll(/Table (\w+) \{([\s\S]*?)\n\}/g)) {
  const cols = new Set();
  for (const raw of m[2].split("\n")) {
    const line = raw.trim();
    if (!line || /^(\/\/|Note|indexes|'''|\(|\))/.test(line)) continue;
    const c = line.match(/^([a-z_]+)\s+[a-z]/);
    if (c && !NOISE.has(c[1])) cols.add(c[1]);
  }
  spec.set(m[1], cols);
}

const built = new Map();
for (const m of sql.matchAll(/CREATE TABLE "(\w+)" \(([\s\S]*?)\n\);/g)) {
  built.set(m[1], new Set([...m[2].matchAll(/^\s*"(\w+)"\s/gm)].map((x) => x[1])));
}

const problems = [];
for (const name of new Set([...spec.keys(), ...built.keys()])) {
  if (!spec.has(name)) { problems.push(`${name}: in the database but not in schema.dbml`); continue; }
  if (!built.has(name)) { problems.push(`${name}: in schema.dbml but not in the database`); continue; }
  const onlySpec = [...spec.get(name)].filter((c) => !built.get(name).has(c));
  const onlyBuilt = [...built.get(name)].filter((c) => !spec.get(name).has(c) && !NOISE.has(c));
  if (onlySpec.length) problems.push(`${name}: in dbml only -> ${onlySpec.join(", ")}`);
  if (onlyBuilt.length) problems.push(`${name}: in SQL only  -> ${onlyBuilt.join(", ")}`);
}

console.log(`schema.dbml: ${spec.size} tables · generated SQL: ${built.size} tables`);
if (problems.length) {
  console.error(`\n${problems.length} difference(s):`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("No drift.");
