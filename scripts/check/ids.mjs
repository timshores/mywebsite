// Every element id the explorer's script looks up by name, checked against the built page (#237): $("rev-body") and
// the like throw partway through a render if the markup loses or renames the id. Literal ids, and each chart's
// fig-<key> and svg-<key> from PANELS; ids built from other variables are counted, not checked. Part of
// `npm run build`, after astro build; exits 1 if an id is missing.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(join(root, "src/lib/massppe/explorer.ts"), "utf8");
const page = readFileSync(join(root, "dist/muni-spending/index.html"), "utf8");

const ids = new Set([...source.matchAll(/\$(?:<[^>]+>)?\("([\w-]+)"\)/g)].map((m) => m[1]));
const panels = source.match(/const PANELS = \[([^\]]+)\]/)?.[1].match(/"([\w-]+)"/g)?.map((q) => q.slice(1, -1)) ?? [];
for (const k of panels) ids.add(`fig-${k}`).add(`svg-${k}`);
const built = [...source.matchAll(/\$(?:<[^>]+>)?\(`/g)].length;

const present = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const missing = [...ids].filter((id) => !present.has(id)).sort();
for (const id of missing) console.log(`  ✗ #${id} is looked up but not on the page`);
console.log(`[check:ids] ${ids.size - missing.length} of ${ids.size} ids on the built page (${panels.length} charts; ${built} lookups ` +
  "built from variables, not checked).");
process.exitCode = missing.length ? 1 : 0;
