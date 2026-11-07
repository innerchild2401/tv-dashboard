# Tablou TV

A self-hosted dashboard for a Chromecast. One Next.js app serves the TV page, and later the phone remote, the API and the MCP endpoint. Supabase holds the data. Vercel hosts the app.

This repository is the M0 skeleton. The Today screen renders sample data. The other six views, rotation, the phone remote, MCP and the Pi watchdog are later milestones.

## Defaults

| Choice | Value |
| --- | --- |
| Package manager | pnpm |
| Node | 20 or newer |
| Framework | Next.js (App Router, TypeScript) |
| Supabase region | Central EU (Frankfurt) |
| Vercel function region | `fra1` (`vercel.json`) |
| UI language | Romanian |
| Time zone | Europe/Bucharest, 24-hour clock, weeks start Monday |
| Design size | 1280×720, drawn at 1920×1080 (scale ×1.5) |

## Local setup

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:3000/tv](http://127.0.0.1:3000/tv). In development, with `TV_TOKEN` empty, the page shows the sample Today view. A production process refuses `/tv` until `TV_TOKEN` is set, then the page expects `?token=` to match it.

```bash
pnpm test
pnpm lint
pnpm build
```

`pnpm gen:secrets` prints new values for `TV_TOKEN`, `AGENT_TOKEN`, `PI_TOKEN` and `SESSION_SECRET`. Paste them into `.env.local` and into Vercel Production and Preview. Choose `REMOTE_PIN` yourself (4 to 6 digits). The command does not write a file.

## Environment

`.env.example` lists every variable, what it is for, and where the value comes from. `.env.local` is gitignored and ships with empty values.

Do not deploy, and do not run the seed against a hosted database, until those values are filled. No secret belongs in this repository.

## Projects

Supabase project `xbqcywzbykstjlnrrycl` is in Central EU (Frankfurt). The migration is applied: row level security is enabled on every table, there are no policies, `anon` and `authenticated` have no grants, and the `photos` bucket is private. `lib/db/database.types.ts` is generated from that project. Regenerate it with `pnpm gen:types` after the Supabase CLI is linked.

The Vercel project is `tv-dashboard`, framework Next.js, function region `fra1`, connected to this GitHub repo. No environment variables are set there. Do not deploy until the owner has filled the values below.

Wins-card evidence is enforced with a trigger. Postgres does not allow a subquery inside a check constraint.

The cron migration that calls the production URL is added after the first deploy. The Pi agent is generated after that deploy, because this environment cannot reach the Pi.

## Daily routine contract

Grokbot is not wired up yet (M4). When it is, a run calls `get_dashboard_state`, then `set_recap`, then `upsert_card` for the affirmation, weekly wins and word of the month, then `upsert_events`, `upsert_task` and `shopping_add`, all with stable `externalId` values such as `recap-2026-11-08`. The same handlers will exist as `POST /api/agent/<tool>`.

## Later

Token rotation, backups and the hardening runbook are M7. Scheduling uses Supabase `pg_cron` and `pg_net` after the production URL exists, not Vercel Cron.
