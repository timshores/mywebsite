import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourcePdf = resolve(projectRoot, "..", "Profile.pdf");
const publicDir = resolve(projectRoot, "public");
const profileDataFile = resolve(projectRoot, "src", "data", "profile.ts");
const portfolioDataFile = resolve(projectRoot, "src", "data", "portfolio.ts");
const resumeDataFile = resolve(projectRoot, "src", "data", "resume.ts");
const publishedResumeFileName = "Tim-Shores-Resume-2026.pdf";

const colors = {
  ink: "#1f1f1c",
  muted: "#524f45",
  line: "#d8d0c2",
  accent: "#b65c3d",
  accent2: "#556a57",
  paper: "#fefcf7",
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const profile = await readConstExport(profileDataFile, "profile");
const portfolioItems = await readConstExport(portfolioDataFile, "portfolioItems");
const resumeDate = existsSync(sourcePdf) ? statSync(sourcePdf).mtime : new Date();
const fileName = `Shores Resume ${monthNames[resumeDate.getMonth()]} ${resumeDate.getFullYear()}.pdf`;
const outputPath = resolve(publicDir, fileName);
const publishedResumePath = resolve(publicDir, publishedResumeFileName);

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

if (existsSync(publishedResumePath)) {
  writeResumeData(publishedResumeFileName);
  console.log(`[resume] Using existing ${publishedResumeFileName}`);
} else {
  await writeResumePdf(profile, outputPath);
  writeResumeData(fileName);
  console.log(`[resume] Generated ${basename(outputPath)}`);
}

async function writeResumePdf(profile, outputPath) {
  await new Promise((resolvePromise, rejectPromise) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 28,
      bufferPages: true,
      info: {
        Title: `${profile.name} Resume`,
        Author: profile.name,
        Subject: profile.headline,
      },
    });
    const stream = createWriteStream(outputPath);
    stream.on("finish", resolvePromise);
    stream.on("error", rejectPromise);
    doc.on("error", rejectPromise);
    doc.pipe(stream);

    const usedBottom = drawResume(doc, profile, portfolioItems);

    const pageCount = doc.bufferedPageRange().count;
    for (let index = pageCount - 1; index >= 1; index -= 1) {
      doc.switchToPage(index);
      doc.text("", 0, 0);
    }

    if (pageCount > 1) {
      throw new Error(`Resume overflowed to ${pageCount} pages; tighten generated content before publishing.`);
    }

    if (process.env.RESUME_DEBUG) {
      console.log(`[resume] Used through y=${Math.round(usedBottom)} of ${Math.round(doc.page.height - doc.page.margins.bottom)}`);
    }

    doc.end();
  });
}

function drawResume(doc, profile, portfolioItems) {
  const page = {
    left: 28,
    right: doc.page.width - 28,
    top: 28,
    bottom: doc.page.height - 28,
  };
  const sidebarX = 28;
  const sidebarW = 158;
  const mainX = sidebarX + sidebarW + 22;
  const mainW = page.right - mainX;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.paper);
  doc.rect(0, 0, 12, doc.page.height).fill(colors.accent2);
  doc.rect(12, 0, 4, doc.page.height).fill(colors.accent);

  doc
    .font("Times-Bold")
    .fontSize(30)
    .fillColor(colors.ink)
    .text(profile.name, mainX, page.top - 2, { width: mainW });
  doc
    .moveTo(mainX, 66)
    .lineTo(page.right, 66)
    .lineWidth(1.1)
    .strokeColor(colors.line)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(colors.muted)
    .text(profile.headline, mainX, 72, { width: mainW, lineGap: 1.1 });

  let sideY = page.top + 4;
  sideY = section(doc, "Contact", sidebarX, sideY, sidebarW, () => {
    small(doc, profile.location, sidebarX, doc.y, sidebarW);
    small(doc, profile.email, sidebarX, doc.y + 3.5, sidebarW);
    small(doc, profile.linkedin.replace(/^https?:\/\//, ""), sidebarX, doc.y + 3.5, sidebarW);
    small(doc, "timshores.com", sidebarX, doc.y + 3.5, sidebarW, "https://timshores.com");
  });
  sideY = section(doc, "Skills", sidebarX, sideY + 18, sidebarW, () => {
    pillList(doc, profile.topSkills.slice(0, 8), sidebarX, doc.y, sidebarW);
  });
  sideY = section(doc, "Certifications", sidebarX, doc.y + 18, sidebarW, () => {
    bulletList(doc, profile.certifications.slice(0, 4), sidebarX, doc.y, sidebarW, {
      fontSize: 8.1,
      gap: 2.7,
      bulletSize: 2.4,
    });
  });
  sideY = section(doc, "Education", sidebarX, doc.y + 18, sidebarW, () => {
    for (const edu of profile.education.slice(0, 2)) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(colors.ink).text(edu.school, sidebarX, doc.y, { width: sidebarW });
      doc.font("Helvetica").fontSize(8).fillColor(colors.muted).text(edu.credential, sidebarX, doc.y + 1.2, {
        width: sidebarW,
        lineGap: 0.65,
      });
      if (edu.period) {
        doc.fontSize(7.7).text(edu.period, sidebarX, doc.y + 1.2, { width: sidebarW });
      }
      doc.y += 5.6;
    }
  });

  let mainY = 100;
  mainY = section(doc, "Profile", mainX, mainY, mainW, () => {
    paragraph(doc, profile.summary.slice(0, 2).join(" "), mainX, doc.y, mainW, 10.5, 1.5);
  });

  mainY = section(doc, "Portfolio Highlights", mainX, doc.y + 10, mainW, () => {
    doc
      .font("Helvetica")
      .fontSize(8.4)
      .fillColor(colors.accent2)
      .text("timshores.com/portfolio", mainX, doc.y - 0.5, {
        width: mainW,
        align: "right",
        link: "https://timshores.com/portfolio",
        underline: false,
      });
    doc.y += 4;
    for (const project of resumeSelectedWork(profile, portfolioItems)) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10.25)
        .fillColor(colors.ink)
        .text(project.title, mainX, doc.y, { width: mainW - 100, continued: false });
      doc
        .font("Helvetica")
        .fontSize(8.6)
        .fillColor(colors.accent2)
        .text(project.domain, mainX + mainW - 96, doc.y - 11.2, { width: 96, align: "right" });
      paragraph(doc, shorten(`${project.description} ${project.impact}`, 118), mainX, doc.y + 1.8, mainW, 10.5, 1);
      doc.y += 2.2;
    }
  });

  const experienceY = section(doc, "Experience", mainX, doc.y + 9, mainW, () => {
    for (const item of resumeExperience(profile.experience)) {
      const roleLine = `${item.role}, ${item.company}`;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.ink).text(roleLine, mainX, doc.y, {
        width: mainW - 120,
        continued: false,
      });
      doc.font("Helvetica").fontSize(8.4).fillColor(colors.muted).text(item.period, mainX + mainW - 116, doc.y - 11, {
        width: 116,
        align: "right",
      });
      const highlight = shorten(item.highlights[0] ?? "", 180);
      paragraph(doc, highlight, mainX, doc.y + 1.8, mainW, 10.5, 1.05);
      doc.y += 3.2;
    }
  });

  return Math.max(sideY, experienceY, doc.y);
}

function resumeSelectedWork(profile, portfolioItems) {
  const not1More = profile.experience.find((item) => item.company === "Not1More");
  const featured = portfolioItems
    .filter((item) => item.resume)
    .map((item) => ({
      title: item.title,
      domain: item.type,
      description: item.summary,
      impact: "",
    }));

  return [
    not1More && {
      title: "Not1More Forest Defender Technology",
      domain: "Environmental Justice",
      description:
        "Technology and coalition development for frontline forest defenders facing violence and reprisals.",
      impact:
        "Built field technology, CRM, data collection, web, and advocacy systems for remote forest-defense work.",
    },
    ...featured,
  ].filter(Boolean);
}

function resumeExperience(experience) {
  const required = [
    (item) => item.company === "Hope for Haiti" && item.role.includes("Director of Data"),
    (item) => item.company === "VentureWell" && item.role === "Platform Analyst",
  ];
  const picked = [];

  for (const item of experience.slice(0, 2)) {
    picked.push(item);
  }

  for (const match of required) {
    const item = experience.find(match);
    if (item && !picked.includes(item)) {
      picked.push(item);
    }
  }

  return picked.slice(0, 4);
}

function shorten(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  const clipped = text.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("; "));
  if (sentenceEnd > maxLength * 0.55) {
    return clipped.slice(0, sentenceEnd + 1);
  }

  const wordEnd = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, wordEnd > 0 ? wordEnd : maxLength).replace(/[,.:-]\s*$/, "")}.`;
}

function section(doc, title, x, y, width, drawContent) {
  doc.y = y;
  doc.font("Helvetica-Bold").fontSize(8.4).fillColor(colors.accent).text(title.toUpperCase(), x, y, {
    width,
    characterSpacing: 0.7,
  });
  doc.moveTo(x, doc.y + 2).lineTo(x + width, doc.y + 2).lineWidth(0.7).strokeColor(colors.line).stroke();
  doc.y += 7.5;
  drawContent();
  return doc.y;
}

function paragraph(doc, text, x, y, width, fontSize, lineGap) {
  doc
    .font("Helvetica")
    .fontSize(fontSize)
    .fillColor(colors.muted)
    .text(text, x, y, {
      width,
      lineGap,
    });
}

function small(doc, text, x, y, width, link = null) {
  doc.font("Helvetica").fontSize(8.35).fillColor(colors.muted).text(text, x, y, {
    width,
    lineGap: 0.8,
    link,
    underline: false,
  });
}

function bulletList(doc, items, x, y, width, options = {}) {
  const fontSize = options.fontSize ?? 7.5;
  const gap = options.gap ?? 2.8;
  const bulletSize = options.bulletSize ?? 2.4;
  doc.y = y;
  for (const item of items) {
    const textY = doc.y;
    doc.circle(x + 2, textY + fontSize * 0.55, bulletSize / 2).fill(colors.accent2);
    doc.font("Helvetica").fontSize(fontSize).fillColor(colors.muted).text(item, x + 8, textY, {
      width: width - 8,
      lineGap: 0.3,
    });
    doc.y += gap;
  }
}

function pillList(doc, items, x, y, width) {
  doc.y = y;
  let cursorX = x;
  let cursorY = y;
  for (const item of items) {
    doc.font("Helvetica").fontSize(8);
    const labelW = Math.min(doc.widthOfString(item) + 11, width);
    if (cursorX + labelW > x + width) {
      cursorX = x;
      cursorY += 17;
    }
    doc.roundedRect(cursorX, cursorY, labelW, 12.8, 3).fillAndStroke("#ffffff", colors.line);
    doc.font("Helvetica").fontSize(8).fillColor(colors.ink).text(item, cursorX + 5.5, cursorY + 2.9, {
      width: labelW - 9,
      lineBreak: false,
    });
    cursorX += labelW + 4;
    doc.y = cursorY + 15.8;
  }
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

function writeResumeData(fileName) {
  const href = `/${encodeURIComponent(fileName)}`;
  const source = `export const resume = ${JSON.stringify({ fileName, href }, null, 2)} as const;\n`;
  writeFileSync(resumeDataFile, source);
}
