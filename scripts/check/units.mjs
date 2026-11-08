// Runs scripts/check/units.test.ts: the explorer's TypeScript, bundled by esbuild into one module in memory, so the
// cases run in Node with nothing to install (#237). Part of `npm run build`; exits 1 if a case fails.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { outputFiles } = await build({ entryPoints: [join(here, "units.test.ts")], bundle: true, write: false, format: "esm",
  platform: "node", logLevel: "warning" });
const { cases } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

const failed = cases.filter(([, got, want]) => !Object.is(got, want) && got !== want);
for (const [name, got, want] of failed) console.log(`  ✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
console.log(`[check:units] ${cases.length - failed.length} of ${cases.length} cases pass.`);
process.exitCode = failed.length ? 1 : 0;
