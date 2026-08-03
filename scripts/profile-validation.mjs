import { readFileSync } from "node:fs";

export const expectedProfileName = "Tim Shores";

export async function readConstExport(filePath, exportName) {
  const source = readFileSync(filePath, "utf8");
  const moduleSource = source
    .replace(new RegExp(`export\\s+const\\s+${exportName}\\s*=`), "export default")
    .replace(/\s+as const;?\s*$/, ";");
  const encoded = Buffer.from(moduleSource).toString("base64");
  const module = await import(`data:text/javascript;base64,${encoded}`);
  return module.default;
}

export function validateProfile(profile, { previousProfile = null } = {}) {
  const failures = [];

  if (profile.name !== expectedProfileName) {
    failures.push(`name must be ${JSON.stringify(expectedProfileName)}; got ${JSON.stringify(profile.name)}`);
  }
  if (typeof profile.headline !== "string" || profile.headline.trim().length < 12) {
    failures.push("headline must contain at least 12 characters");
  }
  if (!Array.isArray(profile.summary) || profile.summary.length < 2) {
    failures.push("summary must contain at least two paragraphs");
  }
  if (!Array.isArray(profile.experience) || profile.experience.length < 3) {
    failures.push("experience must contain at least three roles");
  }
  if (!Array.isArray(profile.education) || profile.education.length < 1) {
    failures.push("education must contain at least one entry");
  }

  for (const [index, item] of (profile.experience ?? []).entries()) {
    if (!item.company || !item.role || !item.period || !Array.isArray(item.highlights) || item.highlights.length === 0) {
      failures.push(`experience[${index}] is missing company, role, period, or highlights`);
    }
  }

  if (previousProfile?.experience?.length) {
    const minimum = Math.ceil(previousProfile.experience.length * 0.75);
    if ((profile.experience?.length ?? 0) < minimum) {
      failures.push(
        `experience shrank from ${previousProfile.experience.length} to ${profile.experience?.length ?? 0} roles (minimum ${minimum})`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Profile validation failed:\n- ${failures.join("\n- ")}`);
  }
}
