# Tim Shores Portfolio Site

Astro site for `timshores.com`, deployed from GitHub.

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Content Source

Main profile content is in `src/data/profile.ts`.

- Home page: `src/pages/index.astro`
- Work page: `src/pages/work.astro`
- Contact page: `src/pages/contact.astro`

## LinkedIn PDF Sync (No Paid API Needed)

This project includes a simple sync step:

- Source: `../Profile.pdf` (repo root)
- Target: `public/Profile.pdf`
- Script: `scripts/sync-profile-pdf.mjs`

`npm run dev` and `npm run build` both run `profile:sync` first.
If you replace `Profile.pdf`, the next build/dev run updates the public copy.

## Update Flow

1. Export your latest LinkedIn profile PDF and replace `Profile.pdf` at repo root.
2. Update `src/data/profile.ts` if headline/summary/work details changed.
3. Run `npm run build`.
4. Commit and push to trigger your existing GitHub-to-production deploy.

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
