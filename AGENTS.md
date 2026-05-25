# Agent Handoff Notes

## Project

Astro portfolio site for `timshores.com`.

Common commands:

- `npm run dev`
- `npm run build`
- `npm run profile:sync`
- `npm run linkedin:sync`

## LinkedIn Feed Work In Progress

The user is collecting LinkedIn data-export batches over time. LinkedIn appears to provide them asynchronously, so the current archive is only the first of several expected downloads.

Raw LinkedIn archive files must stay out of `public/` and source control. Put them in:

```text
local-data/linkedin/
```

That folder is ignored by git.

Current archive location:

```text
local-data/linkedin/Basic_LinkedInDataExport_05-23-2026.zip.zip
```

The current archive contains `Rich_Media.csv` but no obvious full post-history CSV such as `Shares.csv`, `Posts.csv`, or similar. The generated data therefore captures only feed media upload records, not post body text.

Implemented but not publicly routed yet:

- Parser: `scripts/sync-linkedin-feed.mjs`
- Generated sanitized data: `src/data/linkedinFeed.ts`
- Draft Astro page: `src/drafts/linkedin.astro`

The draft page was intentionally moved out of `src/pages/` so it does not build as `/linkedin` yet. Do not restore the public page or nav item until there is enough export data to make it useful.

When a later LinkedIn export arrives:

1. Put the new ZIP in `local-data/linkedin/`.
2. Inspect its file list with `tar -tf`.
3. Look for post/share/comment files with actual text content.
4. Update `scripts/sync-linkedin-feed.mjs` to merge any newly available post text with the existing media rows.
5. Run `npm run linkedin:sync`.
6. Review `src/data/linkedinFeed.ts`.
7. Only then move `src/drafts/linkedin.astro` back to `src/pages/linkedin.astro` and add the nav tab.

## Important Context

The user explicitly noticed that the LinkedIn archive should not have been placed in `public/`. Keep raw source exports private/local. Only generated, curated, non-sensitive site data should be committed.
