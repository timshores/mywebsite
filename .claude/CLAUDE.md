# Proto-Parsec - Personal Website Project

## Project Overview
This is Tim Shores' professional/personal website showcasing work as a Data Storyteller. The site is built with Astro and deployed to timshores.com via GitHub Actions to Namecheap FTP hosting.

## Technology Stack
- **Framework**: Astro 5.15.5 (static site generator)
- **Language**: TypeScript (strict mode), Astro components, vanilla JavaScript
- **Styling**: Scoped CSS within components, CSS custom properties
- **Deployment**: GitHub Actions → Namecheap FTP (SamKirkland/FTP-Deploy-Action)

## Site Structure
- **src/pages/**: Auto-routed pages (index.astro, work.astro, contact.astro)
- **src/layouts/**: Shared layout wrapper with navigation
- **src/components/**: Reusable Astro components
- **src/assets/**: SVGs and images
- **public/**: Static assets (portraits, favicon)

## Design System & Style Guidelines

### Color Palette
- **Primary Background**: Manila beige (`#F4EFE3`)
- **Text**: Warm inks (`#322E29`)
- **Accent**: Red (`#D35545`)
- **Shadows**: `rgba(50, 46, 41, 0.25)`

### Key Design Patterns
- **Navigation**: Sticky folder-tab style with `clip-path` for distinctive shape
- **Cards**: Box-shadow hover effects with stepped shadow pattern (8px steps)
- **Left Margin**: Decorative red line accent
- **Responsive**: Mobile breakpoint at 768px
- **Transitions**: Smooth hover animations and fade-in effects

### Typography
- Primary font: System fonts with fallback stack
- Headings use varying weights for hierarchy

## Build & Development Commands
- `npm run dev` - Start local dev server (localhost:4321)
- `npm run build` - Build static site to ./dist/
- `npm run preview` - Preview production build locally

## Deployment
- **Auto-deploy**: Pushes to main branch trigger GitHub Actions workflow
- **Target**: Namecheap FTP server root directory
- **Build output**: ./dist/ folder contents
- **Workflow**: .github/workflows/deploy.yml

## Important Conventions

### When Making Changes
- Maintain the existing design aesthetic (manila/warm ink/red color scheme)
- Keep the distinctive folder-tab navigation style
- Preserve scoped component styling patterns
- Test responsive behavior at 768px breakpoint
- Ensure all images are optimized before adding to public/

### Content Updates
- **About/Home** (index.astro): Bio, skills, experience timeline
- **Work** (work.astro): Portfolio projects with tags and tech stacks
- **Contact** (contact.astro): Contact info and availability

### Code Style
- Use TypeScript strict mode
- Follow Astro component conventions (frontmatter + template + scoped styles)
- Keep vanilla JavaScript for interactive features (no framework dependencies)
- Use CSS custom properties for themeable values

## Deployment Considerations
- Changes to main branch deploy automatically
- FTP credentials stored in GitHub Secrets (FTP_SERVER, FTP_USERNAME, FTP_PASSWORD)
- Build output goes directly to server root (no subdirectory)
- Node.js 20 used in CI/CD pipeline

## Asset Management
- Portrait images in public/ (portrait.jpg, portrait-a.png, portrait-b.png)
- SVGs can go in either src/assets/ or public/ depending on usage
- Favicon is public/favicon.svg

## Testing Before Deployment
- Always run `npm run build` locally to catch build errors
- Preview built site with `npm run preview`
- Check mobile responsiveness manually at narrow widths
