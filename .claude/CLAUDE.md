# Proto-Parsec - Personal Website Project

## Project Overview
This is Tim Shores' professional/personal website, timshores.com. The site is built with Astro and deployed via
GitHub Actions to Namecheap FTP hosting. Its largest part is the Municipal spending explorer at /muni-spending/.

## Technology Stack
- **Framework**: Astro 6 (package.json asks for ^6.3.7; 6.4.8 installed), a static site generator
- **Language**: TypeScript (strict mode), Astro components, vanilla JavaScript; no UI framework, by design
- **Styling**: Scoped CSS within components, plain stylesheets for the explorer, CSS custom properties
- **Deployment**: GitHub Actions → Namecheap FTP (SamKirkland/FTP-Deploy-Action)

## Site Structure
- **src/pages/**: Auto-routed pages: index.astro (About), work.astro, portfolio.astro, contact.astro, and
  muni-spending/ (the explorer; its old addresses, mass-school-spending/ and massppe/, render Moved.astro)
- **src/lib/massppe/**: The explorer's TypeScript: explorer.ts (district and town views), map.ts, commonwealth.ts
  (the plots), cap.ts, charts.ts, scatter.ts, notes.ts (About the data), format.ts (how every figure is written),
  stats.ts
- **src/data/massppe/**: The explorer's data, written by ~/projects/schools/ppe_report/export_explorer_data.py;
  regenerate it there, never by hand
- **src/layouts/Layout.astro**: Shared layout: the header, its navigation, the design tokens, the new-tab rule
- **src/components/**: LiveRibbon (the home page's link to the explorer), Moved, massppe/GroupMembers
- **public/**: Static assets: portraits, resume PDFs, favicon, the explorer's downloadable CSVs

## Design System & Style Guidelines

### Color Palette
Custom properties on `:root` in Layout.astro:
- **Page**: `--canvas` #f4f1e8, with faint radial washes; content sits on `--paper` #fefcf7
- **Text**: `--ink` #1f1f1c, `--ink-soft` #524f45
- **Accents**: `--accent` #b65c3d (rust red), `--accent-2` #556a57 (green)
- **Lines and shadows**: `--line` #d8d0c2, `--shadow` rgba(31, 31, 28, 0.1)

### Key Design Patterns
- **Navigation**: pill tabs in the header; the active tab fills with a gradient from `--accent` to `--accent-2`
- **Cards**: plain content panels. A card is not a control; only the links inside it act (design voice, 2026-11-01:
  the click-to-pop stepped shadow announced every card as a button and swallowed Enter on the links inside)
- **Accent rules**: experience and work items carry a 4px left border in `--accent-2`
- **Copy width**: prose runs the full width of its column, as a rule (Tim, 2026-11-02). No `max-width` on
  paragraphs, lists, notes, or intros; tooltips, controls, tables, and dialog headings keep theirs
- **Responsive**: Layout's header folds at 760px; the home page's hero and the explorer fold at 860px; check
  320px to 1920px, with no sideways scroll at any width
- **Numbers**: every figure the explorer shows goes through format.ts, one rule for each kind of figure

### Typography
- Body: Karla; headings: Besley (Google Fonts, loaded in `src/layouts/Layout.astro`)

## Build & Development Commands
- `npm run dev` - Start local dev server (localhost:4321)
- `npm run build` - Check the profile data, then build the static site to ./dist/
- `npm run preview` - Preview production build locally
- Type check: `npx tsc` here is a placeholder package that checks nothing. Use a real TypeScript install outside the
  repo (`npm install --prefix <scratch>/ts typescript`) and run `node <scratch>/ts/node_modules/typescript/bin/tsc
  --noEmit -p .`; its only errors today are four in the astro config files (missing node types)

## Deployment
- **Auto-deploy**: Pushes to main trigger the GitHub Actions workflow (.github/workflows/deploy.yml), which runs
  `npm ci` and `npm run build` on Node 22 and uploads ./dist/ to the server root
- FTP credentials are GitHub Secrets (FTP_SERVER, FTP_USERNAME, FTP_PASSWORD)

## Important Conventions

### When Making Changes
- Keep the design tokens and the pill-tab navigation
- The explorer's styles are plain stylesheets anchored on `.explorer` (#237): src/lib/massppe/explorer.css for the
  page and what every tab shares, and map.css, commonwealth.css and cap.css, each imported by the module that builds
  its elements. They reach markup and built elements alike. Other pages keep Astro's scoped styles, where a rule
  reaches only the markup in its file (`:global()` for elements a script builds)
- Check every explorer tab for sideways scroll at phone width (320px and 375px)
- Ensure images are optimized before adding them to public/

### Content Updates
- **About/Home** (index.astro): data from src/data/profile.ts
- **Work** (work.astro) and **Portfolio** (portfolio.astro): data from src/data/portfolio.ts
- **Contact** (contact.astro)

### Code Style
- Use TypeScript strict mode
- Follow Astro component conventions (frontmatter + template + scoped styles)
- Keep vanilla JavaScript for interactive features (no framework dependencies)
- Use CSS custom properties for themeable values

## Asset Management
- Portrait images in public/ (portrait-a.png, portrait-b.png)
- SVGs and images processed by Astro go in src/assets/ (the ribbon); others in public/
- Favicon is public/favicon.svg

## Testing Before Deployment
- `npm run build` runs `npm run check:units` first: format.ts and stats.ts, case by case (scripts/check/units.test.ts)
  and `npm run check:ids` after: every element id explorer.ts looks up is on the built page
- For a change to the explorer, check it in a browser with `npm run check:explorer -- <command>` against the dev
  server or the live site (scripts/check/explorer.mjs; Playwright comes from seahag's evals):
  - `snapshot BASE OUT.json` before and after, then `compare A.json B.json`: the words and numbers of a set of
    views, their charts' axis labels and marks, comparison and full data tables, and every map measure's legend
  - `styles BASE OUT.json` before and after a CSS change, then `compare`: every explorer element's computed style
  - `overflow BASE`: no sideways scroll on any tab at 320-1366px; `colors BASE`: each map figure in one color
- For a change to the data, regenerate it in the pipeline and check it there
  (~/projects/schools/ppe_report/check_explorer_data.py: `shape SITE`, `diff BEFORE AFTER`)
- Preview the built site with `npm run preview`
