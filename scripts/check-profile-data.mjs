import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConstExport, validateProfile } from "./profile-validation.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const profileDataFile = resolve(scriptDir, "..", "src", "data", "profile.ts");
const profile = await readConstExport(profileDataFile, "profile");

validateProfile(profile);
console.log("[profile:check] Profile data passed integrity checks.");
