# Texas Promise Tracker

An independent public ledger of what James Talarico and Gina Hinojosa promised, so people can check later whether they delivered.

This is not a campaign site and not a site of the State of Texas. It only shows records that are stored. It does not invent quotes, votes, or donors.

The promise data is read from the Supabase schema `tx_tracker`. The website never writes to it.

## Run it locally

Use Node.js 22.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server also allows `127.0.0.1`, so the page still hydrates if you open it that way.

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` and `tsc --noEmit` |
| `npm run build` | Production build. It reads the live ledger while it prerenders. |

## Environment variables

Copy `.env.example` to `.env.local`. The publishable key is public. It is safe in the browser and can only read `tx_tracker`. Do not add a service-role key.

| Name | Required | Where |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Local, GitHub Actions, Vercel Production, Preview, and Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Same |
| `NEXT_PUBLIC_SITE_URL` | No | Vercel Production, after the site has a domain. Used for Open Graph URLs. |

`NEXT_PUBLIC_` values are inlined at **build** time. Set them in Vercel before the first deployment, not only at runtime.

GitHub Actions copies `.env.example` to `.env.local` before lint, typecheck, and build. That file holds the same public key. No repository secret is required for CI.

## Pages

- `/` scoreboard, days until the oath, and coming-soon cards
- A header theme button. It follows the system setting until you pick light or dark, then remembers that choice in this browser.
- `/politicians/james-talarico` and `/politicians/gina-hinojosa`
- `/promises/[id]` quote, source, archive, and status timeline
- `/archives` screenshots
- `/how-we-track` methodology
- `/roadmap` what is live, and what is not started
- `/agents` how software should read the site
- `/llms.txt` and `/api/openapi.json`

## Agent API

Read only.

- `GET /api/politicians`
- `GET /api/politicians/{slug}/summary`
- `GET /api/promises` with `politician`, `topic`, `status`, `type`, `q`, `source`, `limit`, `offset`
- `GET /api/promises/{id}`
- `GET /api/sources`
- `GET /api/openapi.json`

`type` is `explicit_pledge` or `platform`. `status` is `pending`, `in_progress`, `kept`, `partial`, `broken`, `superseded`, or `unverified`.

Voting records and donations are not in the API. The field `not_yet_tracked` says so. Do not invent them.

## Contributing

Issues and pull requests are welcome at [stozo04/tx-promise-tracker](https://github.com/stozo04/tx-promise-tracker). Use the issue templates. The site stays read-only: do not add a write path to Supabase.

### Suggest a promise

Open an issue with the template **Suggest a promise**. Include:

- The politician
- The verbatim quote, copied exactly
- A primary source URL (the page, post, or video where they said it)
- The date on that source, if it has one
- Whether it is an explicit pledge ("I will…") or a platform line

A news story that only paraphrases them is not a primary source. New promises start as pending.

### Propose a status change

Open an issue with the template **Propose a status change**. Include:

- A link to the promise
- The status you propose: `in_progress`, `kept`, `partial`, `broken`, or `superseded`
- An evidence URL (a vote, a signed bill, a veto, a budget, an official act, or their own later statement)
- A short note of what that evidence shows, and the date on it

A status does not change on a hunch. Pending stays pending until the evidence is public.

## Backlog

Two records are planned and **not started**. There is no sample data for either. See [ROADMAP.md](ROADMAP.md) and the coming-soon cards on the home page, each politician page, and [/roadmap](/roadmap).

### Voting record

Show how each official votes once they are in office, linked to a promise only when the vote actually relates to it.

- James Talarico: Congress.gov and Senate roll calls
- Gina Hinojosa: Texas bill signings and vetoes

Use the **Voting record plan** issue template. Do not add sample votes.

### Donations

Show who contributed, with the filing that proves the name and the amount.

- James Talarico: FEC filings
- Gina Hinojosa: Texas Ethics Commission reports

Use the **Donations plan** issue template. Do not add sample donors or amounts.

## Deploy on Vercel

The app is a Next.js App Router project. Vercel detects it. There is no `vercel.json`. Leave the framework defaults alone.

1. Import the GitHub repository `stozo04/tx-promise-tracker`.
2. Framework preset: **Next.js**.
3. Root directory: repository root.
4. Node.js version: **22.x** (also set in `package.json` `engines`).
5. Install command: default. The repo has `package-lock.json`.
6. Build command: default `next build`. Do not set an output directory.
7. Production branch: **main**.
8. Production deploys: on, so a merge to `main` deploys production.
9. Preview deploys: on, so pull requests get a preview.
10. Environment variables, for **Production**, **Preview**, and **Development**:
    - `NEXT_PUBLIC_SUPABASE_URL` = `https://bqyfplifeyvkilkoneph.supabase.co`
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key in `.env.example`
11. After the first deploy, optionally set `NEXT_PUBLIC_SITE_URL` on **Production** to the real `https` origin and redeploy.

Do not add `SUPABASE_SERVICE_ROLE_KEY` or any secret key. The build reads the ledger, so the two public variables have to be present or the build fails on purpose.

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, and build on pull requests and on pushes to `main`.

## License

[MIT](LICENSE). Copyright 2026 Steven Gates.
