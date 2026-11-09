<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Promise vs. Delivered: project rules

These rules came out of building the site from zero. They apply to every agent and person
working in this repo. **[lint]** means ESLint fails the check, **[CI]** means the GitHub
check fails the pull request, and **[review]** means a reviewer has to catch it.

## Truth and sourcing

1. Every promise, action, vote, and dollar shown links to a primary source: the campaign's own
   site or posts, Congress.gov, Senate roll calls, the FEC, Texas Legislature Online, the Office
   of the Governor, or the Texas Ethics Commission. News stories are never evidence. [review]
2. Never invent or estimate data. If something is not loaded, say "Not loaded yet" and name where
   it will come from. [review]
3. Show "what they said" and "what happened," not fuzzy tracker grades. `pending` means not scored
   yet. It never means the official failed. [review]
4. Stay neutral in copy, code comments, and the agent prompt. Describe the record, not the
   officials, their parties, or their policies. [review]
5. No election results or vote totals on the site. Community votes are labeled "Not a scientific
   poll," and results stay hidden until the visitor votes. [review]

## UI

6. Dropdowns always use `<Dropdown>` from `components/dropdown.tsx`, never a native `<select>`,
   so they match the site's theme instead of the operating system's. [lint]
7. Dropdown options show "All …" first, then A to Z, with labels in Title Case. The component
   does the sorting and casing. The one exception is the Status filter in
   `components/promise-explorer.tsx`, which keeps lifecycle order (Pending, In Progress, Kept,
   Partial, Broken, Superseded, Unverified) to match the charts. No other dropdown may pass
   `sort`. [lint]
8. Colors come from the tokens in `app/globals.css` (flag blue and red, said and did cards,
   match, against, and partly). Said is blue and Did is red, matching the flag. No hex colors in
   components. The exceptions are the logo SVG and `app/global-error.tsx`, which renders without
   the stylesheet. [lint]
9. External links open in a new tab. `ExternalLinksInNewTab` in the root layout does this
   site-wide, so don't remove it. Internal links stay in the same tab. [review]
10. "Show all N" and "Show fewer" go below the list, right-aligned. Page-level actions like Sync
    go below the content, right-aligned. [review]
11. A control whose label changes width (for example "Contact them" and "Hide contact info") goes
    last in its row, so the controls beside it don't jump. [review]
12. No `alert`, `confirm`, or `prompt`. Show messages in the page. [lint]
13. Touch targets are at least 44 px tall (`min-h-11`), everything works with a keyboard, every
    icon-only control has an `aria-label`, and each change is checked in both light and dark
    mode. [review]

## URLs, data, and secrets

14. Links meant to be shared or handed to agents use `SITE_URL` from `lib/site.ts`. Don't
    hard-code `vercel.app` or preview addresses. [lint]
15. Supabase: this project lives in the "My Daily Journal" Supabase project, in the `tx_tracker`
    schema, and every new table, function, or setting it adds is prefixed `tx_`. The browser
    reads with the publishable key only. Writes go only through the `tx_sync` and
    `tx_community_vote` Edge Functions, called through `functionUrl()` in `lib/community.ts`. No
    hard-coded `supabase.co` addresses. [lint]
16. The public Edge Functions keep `verify_jwt = false` (see `supabase/config.toml`) and enforce
    their own limits:
    - Sync runs at most once per calendar day (Central time) for the whole site. If nobody starts
      it, the nightly job (`tx_tracker.tx_nightly_sync`, 11:30 pm CT) does.
    - One vote per connection per item.
    - Votes are accepted only from this site's origins.
    - The client IP is read from `cf-connecting-ip` and stored only as a salted hash.

    [review]
17. Secrets never go in the repo, pull requests, issues, logs, or screenshots. The api.data.gov
    key lives only in `tx_tracker.tx_private_settings`. `.env.local` stays gitignored. [review]

## Before you push

18. `npm run lint`, `npm run typecheck`, `npm run build`, and `deno check` on each Edge Function
    must pass. The CI workflow (`.github/workflows/ci.yml`) runs all four on every pull request
    to `main`. [CI]
19. Check UI changes in a real browser, in light and dark mode, before calling them done. [review]
20. When the JSON API changes, update the agent prompt (`components/agent-prompt.tsx`),
    `app/llms.txt/route.ts`, and `lib/openapi.ts` to match. [review]
