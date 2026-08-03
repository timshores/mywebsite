import { resume } from "./resume";

// Hand-maintained. src/data/resume.ts is overwritten by `npm run resume:generate`,
// so the general variant reads its filename from there rather than repeating it.
// Variant PDFs are authored outside this repo and dropped into public/ by hand.
export type ResumeVariant = {
  id: string;
  label: string;
  description: string;
  fileName: string;
  href: string;
};

export const resumeVariants: readonly ResumeVariant[] = [
  {
    id: "general",
    label: "General",
    description:
      "Full career overview across content, data, research, and civic work.",
    fileName: resume.fileName,
    href: resume.href,
  },
  {
    id: "content-strategy",
    label: "Content Strategy",
    description:
      "Content strategy, business analysis, and AI-native knowledge systems.",
    fileName: "Tim-Shores-Resume-Content-Strategy-2026.pdf",
    href: "/Tim-Shores-Resume-Content-Strategy-2026.pdf",
  },
  {
    id: "policy-governance",
    label: "Policy & Governance",
    description:
      "School governance, facilitation and training, and policy analysis.",
    fileName: "Tim-Shores-Resume-Policy-Governance-2026.pdf",
    href: "/Tim-Shores-Resume-Policy-Governance-2026.pdf",
  },
];
