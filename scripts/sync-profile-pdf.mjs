import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourcePdf = resolve(projectRoot, "..", "Profile.pdf");
const publicPdf = resolve(projectRoot, "public", "Profile.pdf");
const profileDataFile = resolve(projectRoot, "src", "data", "profile.ts");
const profileDisplayFile = resolve(projectRoot, "src", "data", "profileDisplay.ts");

const monthPattern =
  "(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)";
const periodPattern = new RegExp(`^${monthPattern}\\s+\\d{4}\\s+-\\s+(?:Present|${monthPattern}\\s+\\d{4})(?:\\s+\\(.+\\))?$`);

if (!existsSync(sourcePdf)) {
  console.log(`[profile:sync] Source not found: ${sourcePdf}`);
  process.exit(0);
}

syncPublicPdf();
await syncProfileData();

function syncPublicPdf() {
  const sourceStat = statSync(sourcePdf);
  const targetExists = existsSync(publicPdf);
  const targetStat = targetExists ? statSync(publicPdf) : null;
  const isOutdated = !targetExists || sourceStat.mtimeMs > (targetStat?.mtimeMs ?? 0);

  if (!isOutdated) {
    console.log("[profile:sync] public/Profile.pdf is up to date.");
    return;
  }

  copyFileSync(sourcePdf, publicPdf);
  console.log("[profile:sync] Copied Profile.pdf to public/Profile.pdf");
}

async function syncProfileData() {
  const currentProfile = await readConstExport(profileDataFile, "profile");
  const profileDisplay = await readConstExport(profileDisplayFile, "profileDisplay");
  const pdfText = await extractPdfText(sourcePdf);
  const parsedProfile = parseLinkedInProfile(pdfText, currentProfile);
  const nextProfile = {
    ...currentProfile,
    ...parsedProfile,
    focusAreas: currentProfile.focusAreas,
    topSkills: profileDisplay.topSkills,
    certifications: profileDisplay.certifications,
    selectedWork: currentProfile.selectedWork,
    civicRoles: currentProfile.civicRoles,
  };

  const nextSource = `export const profile = ${formatValue(nextProfile, 0)} as const;\n`;
  const currentSource = readFileSync(profileDataFile, "utf8");

  if (normalizeLineEndings(currentSource) === normalizeLineEndings(nextSource)) {
    console.log("[profile:sync] src/data/profile.ts is up to date.");
    return;
  }

  writeFileSync(profileDataFile, nextSource);
  console.log("[profile:sync] Updated src/data/profile.ts from Profile.pdf");
}

async function readConstExport(filePath, exportName) {
  const source = readFileSync(filePath, "utf8");
  const moduleSource = source
    .replace(new RegExp(`export\\s+const\\s+${exportName}\\s*=`), "export default")
    .replace(/\s+as const;?\s*$/, ";");
  const encoded = Buffer.from(moduleSource).toString("base64");
  const module = await import(`data:text/javascript;base64,${encoded}`);
  return module.default;
}

async function extractPdfText(pdfPath) {
  const parser = new PDFParse({ data: readFileSync(pdfPath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function parseLinkedInProfile(text, currentProfile) {
  const lines = cleanLines(text);
  const summaryIndex = lines.indexOf("Summary");
  const experienceIndex = lines.indexOf("Experience");
  const educationIndex = lines.indexOf("Education");

  if (summaryIndex < 3 || experienceIndex < summaryIndex || educationIndex < experienceIndex) {
    throw new Error("Could not find expected LinkedIn PDF sections: Summary, Experience, Education.");
  }

  const certifications = sectionLines(lines, "Certifications", currentProfile.name).filter(
    (line) => !["Top Skills", "Languages", "English"].includes(line),
  );
  const topSkills = sectionLines(lines, "Top Skills", "Languages");

  const name = lines[summaryIndex - 3];
  const headline = lines[summaryIndex - 2];
  const location = lines[summaryIndex - 1];
  const email = lines.find((line) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) ?? currentProfile.email;
  const linkedInLine = lines.find((line) => line.includes("linkedin.com/in/"));
  const linkedin = linkedInLine?.startsWith("http") ? linkedInLine : `https://${linkedInLine}`;

  const summary = splitSummary(lines.slice(summaryIndex + 1, experienceIndex).join(" "));
  const experience = parseExperience(lines.slice(experienceIndex + 1, educationIndex), currentProfile.experience);
  const education = parseEducation(lines.slice(educationIndex + 1));

  return {
    name,
    headline,
    headlineLines: splitHeadline(headline),
    location,
    email,
    linkedin: linkedin ?? currentProfile.linkedin,
    summary,
    topSkills,
    certifications,
    experience,
    education,
  };
}

function cleanLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Page \d+ of \d+$/.test(line))
    .filter((line) => !/^-- \d+ of \d+ --$/.test(line));
}

function sectionLines(lines, startLabel, endLabel) {
  const start = lines.indexOf(startLabel);
  const end = lines.indexOf(endLabel);
  if (start === -1 || end === -1 || end <= start) return [];
  return lines.slice(start + 1, end);
}

function splitSummary(summaryText) {
  const normalized = summaryText
    .replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1-$2")
    .replace(/([a-z0-9])\.([A-Z])/g, "$1. $2")
    .replace(/\s+/g, " ")
    .trim();

  const paragraphStarts = [
    "At Cisco,",
    "Before Cisco,",
    "Outside work,",
    "My range of work",
    "I work regularly",
  ];

  return paragraphStarts
    .reduce((text, start) => text.replace(new RegExp(`\\s+(${escapeRegExp(start)})`, "g"), "\n$1"), normalized)
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function parseExperience(lines, currentExperience) {
  const companyNames = [...new Set(currentExperience.map((item) => item.company))];
  const items = [];
  let activeCompany = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (companyNames.includes(line)) {
      activeCompany = line;
      continue;
    }

    if (!periodPattern.test(line)) continue;

    const role = lines[index - 1];
    const company = activeCompany ?? findNearestCompany(lines, index, companyNames);
    const nextPeriodIndex = findNextPeriodIndex(lines, index + 1);
    const nextCompanyIndex = findNextCompanyIndex(lines, index + 1, companyNames);
    const endIndex = Math.min(nextPeriodIndex, nextCompanyIndex);
    const rawHighlights = lines.slice(index + 1, endIndex);
    const highlights = splitHighlights(rawHighlights);

    if (company && role && highlights.length > 0) {
      items.push({
        company,
        role,
        period: stripDuration(line),
        highlights,
      });
    }
  }

  return items.length > 0 ? items : currentExperience;
}

function findNearestCompany(lines, periodIndex, companyNames) {
  for (let index = periodIndex - 2; index >= 0; index -= 1) {
    if (companyNames.includes(lines[index])) return lines[index];
  }
  return null;
}

function findNextPeriodIndex(lines, startIndex) {
  const index = lines.findIndex((line, offset) => offset >= startIndex && periodPattern.test(line));
  return index === -1 ? Number.POSITIVE_INFINITY : index - 1;
}

function findNextCompanyIndex(lines, startIndex, companyNames) {
  const index = lines.findIndex((line, offset) => offset >= startIndex && companyNames.includes(line));
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function splitHighlights(lines) {
  const filtered = lines.filter((line, index) => index !== 0 || !isLikelyLocation(line));
  const paragraphs = [];
  let current = [];

  for (const line of filtered) {
    if (isLikelyLocation(line)) continue;
    current.push(line);
    if (/[.!?)]$/.test(line)) {
      paragraphs.push(joinWrappedLines(current));
      current = [];
    }
  }

  if (current.length > 0) paragraphs.push(joinWrappedLines(current));
  return paragraphs.filter(Boolean);
}

function parseEducation(lines) {
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const school = lines[index];
    const credentialLines = [];
    index += 1;

    while (index < lines.length && !looksLikeSchool(lines[index])) {
      credentialLines.push(lines[index]);
      index += 1;
    }

    index -= 1;
    if (school && credentialLines.length > 0) {
      const credentialText = joinWrappedLines(credentialLines);
      const [credential, period = ""] = credentialText.split(/\s+·\s+/);
      entries.push({
        school,
        credential: credential.trim(),
        period: period.replace(/[()]/g, "").trim(),
      });
    }
  }

  return entries;
}

function looksLikeSchool(line) {
  return /\b(University|College|School|Institute|Coursera)\b/.test(line);
}

function splitHeadline(headline) {
  const midpoint = Math.ceil(headline.length / 2);
  const splitAt = headline.indexOf(" and ", Math.max(0, midpoint - 12));
  if (splitAt !== -1) {
    return [headline.slice(0, splitAt).trim(), headline.slice(splitAt + 1).trim()];
  }
  return [headline, ""];
}

function stripDuration(period) {
  return period.replace(/\s+\(.+\)$/, "");
}

function joinWrappedLines(lines) {
  return lines
    .join(" ")
    .replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1-$2")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyLocation(line) {
  return /^[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}$/.test(line) || line === "Leverett";
}

function formatValue(value, depth) {
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${childIndent}${formatValue(item, depth + 1)}`).join(",\n")},\n${indent}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return `{\n${entries
      .map(([key, entryValue]) => `${childIndent}${key}: ${formatValue(entryValue, depth + 1)}`)
      .join(",\n")},\n${indent}}`;
  }

  return JSON.stringify(value);
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
