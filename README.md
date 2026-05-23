# Tim Shores Portfolio Site

Astro site for `timshores.com`, deployed from GitHub.

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

`npm run dev` and `npm run build` both run `profile:sync` first.
If you replace `Profile.pdf`, the next build/dev run updates the public copy and regenerates the LinkedIn-backed fields in `src/data/profile.ts`.

The sync keeps hand-curated site fields from `profile.ts` that are not cleanly represented in the LinkedIn PDF:

- `focusAreas`
- `selectedWork`
- `civicRoles`

The sync also uses `src/data/profileDisplay.ts` instead of LinkedIn's top-of-list defaults for:

- `topSkills`
- `certifications`

## Update Flow

1. Export your latest LinkedIn profile PDF and replace `Profile.pdf` at repo root.
2. Edit `src/data/profileDisplay.ts` if you want different displayed skills or certifications.
3. Run `npm run profile:sync` to preview the generated data changes, or run `npm run dev` / `npm run build`.
4. Review the generated `src/data/profile.ts` diff, especially if LinkedIn changes the PDF layout.
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
