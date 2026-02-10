import { copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourcePdf = resolve(projectRoot, "..", "Profile.pdf");
const publicPdf = resolve(projectRoot, "public", "Profile.pdf");

if (!existsSync(sourcePdf)) {
  console.log(`[profile:sync] Source not found: ${sourcePdf}`);
  process.exit(0);
}

const sourceStat = statSync(sourcePdf);
const targetExists = existsSync(publicPdf);
const targetStat = targetExists ? statSync(publicPdf) : null;

const isOutdated = !targetExists || sourceStat.mtimeMs > (targetStat?.mtimeMs ?? 0);

if (!isOutdated) {
  console.log("[profile:sync] public/Profile.pdf is up to date.");
  process.exit(0);
}

copyFileSync(sourcePdf, publicPdf);
console.log("[profile:sync] Copied Profile.pdf to public/Profile.pdf");
