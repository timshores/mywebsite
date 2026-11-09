// The cap tab's own model (src/lib/massppe/capModel.ts), run on cap.json for every year it has, printed as JSON for
// the evidence record (schools ppe_report/evidence/cap.py, #246): each town's target and required contribution with
// no cap and with a 100% cap, and its income fifth. The same TypeScript the tab draws with, bundled by esbuild as
// units.mjs bundles its cases, so the record checks the screen's arithmetic, not a copy of it.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { outputFiles } = await build({ entryPoints: [join(root, "src/lib/massppe/capModel.ts")], bundle: true, write: false,
  format: "esm", platform: "node", logLevel: "warning" });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const cap = JSON.parse(readFileSync(join(root, "src/data/massppe/cap.json"), "utf8"));
const out = {};
for (const [fy, y] of Object.entries(cap.years)) {
  const run = (c) => {
    const f = m.solve(y.towns, y.totals.target, c);
    return Object.fromEntries(y.towns.map((t) => {
      const target = Math.round(m.targetAt(t.cey, t.foundation, f, c));
      return [t.lea, [target, m.requiredFor(t, target, t.foundation ? (t.cey * f) / t.foundation : 0)]];
    }));
  };
  const { fifthOf } = m.incomeFifths(y.towns);
  out[fy] = { nocap: run(null), cap100: run(1), fifth: Object.fromEntries(y.towns.map((t) => [t.lea, fifthOf.get(t.id) ?? null])) };
}
process.stdout.write(JSON.stringify(out));
