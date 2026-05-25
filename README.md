# Tim Shores Portfolio Site

Astro site for `timshores.com`, deployed from GitHub.

## Project Context / Voice Note

This is the plain-language version of what the project is doing and why:

> Now that I'm among the LR'd, I spruced up my LinkedIn. But that's no good, now I need to update my resume and my website, and keep them all in sync? Gah!
>
> Earlier this year I started building a workflow that keeps the three on the same page. Today, Codex and I finished the task. https://timshores.com/
>
> Obvious problem: I do not want to update the same professional information in seventy-five places. LinkedIn is the easiest to update and it's where the social-media-pressure-drooling-anxiety motivates me to keep my work history, skills, certifications, etc. current. So I treat LinkedIn as the upstream source.
>
> The workflow now looks like this:
>
> 1. I update my LinkedIn profile.
> 2. I export the LinkedIn profile PDF.
> 3. I drop that PDF into my local website project.
> 4. Codex-developed Node scripts parse the PDF and refresh my structured profile data stored in TypeScript files.
> 5. The same workflow generates a one-page PDF resume named by month and year.
> 6. ... And it refreshes the local version of my Astro framework website.
> 7. I push to GitHub.
> 8. GitHub pushes to my web host.
>
> The sync workflow is currently implemented with Node scripts: one script parses the LinkedIn PDF and updates the site data, another uses PDFKit to generate a polished one-page resume from the same source. I keep the LinkedIn-generated profile data separate from a couple of hand-edited TypeScript files for portfolio stuff that LinkedIn doesn't export cleanly, like documentation samples, civic reports, research projects, and other important (to me) bric-a-brac that isn't on LinkedIn.
>
> Now it's super duper easy to make my updates, and I had fun vibe-building it.

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Content Source

Main generated profile content is in `src/data/profile.ts`.
Curated display choices for skills and certifications are in `src/data/profileDisplay.ts`.

- Home page: `src/pages/index.astro`
- Work page: `src/pages/work.astro`
- Contact page: `src/pages/contact.astro`

## LinkedIn PDF Sync (No Paid API Needed)

This project includes a simple sync step:

- Source: `../Profile.pdf` (repo root)
- Target: `public/Profile.pdf`
- Script: `scripts/sync-profile-pdf.mjs`
- Resume generator: `scripts/generate-resume-pdf.mjs`

`npm run dev` and `npm run build` both run `profile:sync` first.
If you replace `Profile.pdf`, the next build/dev run updates the public copy, regenerates the LinkedIn-backed fields in `src/data/profile.ts`, and creates a one-page resume PDF in `public/`.

The sync keeps hand-curated site fields from `profile.ts` that are not cleanly represented in the LinkedIn PDF:

- `focusAreas`
- `selectedWork`
- `civicRoles`

The sync also uses `src/data/profileDisplay.ts` instead of LinkedIn's top-of-list defaults for:

- `topSkills`
- `certifications`

The generated resume is named `Shores Resume [Month] [Year].pdf`, where month and year come from the source `Profile.pdf` file timestamp. The current resume download target is generated in `src/data/resume.ts` and used by the home page button.

## LinkedIn Feed Export

Raw LinkedIn archive exports belong in `local-data/linkedin/`, which is intentionally ignored by git and never served from `public/`.

To refresh the feed page data after downloading a new archive:

1. Put the ZIP file in `local-data/linkedin/`.
2. Run `npm run linkedin:sync`.
3. Review the generated `src/data/linkedinFeed.ts` diff.

The current basic LinkedIn export includes `Rich_Media.csv`, which provides feed media upload dates and links. It does not include full post body text. A draft page is parked at `src/drafts/linkedin.astro` until later LinkedIn export batches arrive.

## Update Flow

1. Export your latest LinkedIn profile PDF and replace `Profile.pdf` at repo root.
2. Edit `src/data/profileDisplay.ts` if you want different displayed skills or certifications.
3. Run `npm run profile:sync` to preview the generated data changes, or run `npm run dev` / `npm run build`.
4. Review the generated `src/data/profile.ts` and `src/data/resume.ts` diffs, especially if LinkedIn changes the PDF layout.
5. Run `npm run build`.
6. Commit and push to trigger your existing GitHub-to-production deploy.

This keeps your public resume PDF and site content aligned without paid LinkedIn integrations.

## Deployment

Production deploys automatically from GitHub Actions on pushes to `main`.

Workflow file:
- `.github/workflows/deploy.yml`

Current deploy stack:
- `actions/checkout@v6`
- `actions/setup-node@v6`
- Node `22`
- `SamKirkland/FTP-Deploy-Action@v4.3.4`

If deploys suddenly fail again, check these first:
- YAML indentation in `deploy.yml`
- valid GitHub Action version tags
- FTP secrets: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
