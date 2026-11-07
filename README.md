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

## What is not provisioned yet

The Supabase project and the Vercel project are not created. This machine does not have the Supabase CLI or the Vercel CLI installed, and `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` are not set. Do not paste tokens into chat. Install the CLIs, sign in, and continue from here:

```bash
# Supabase CLI: https://supabase.com/docs/guides/local-development/cli/getting-started
supabase login
supabase projects list

# Vercel CLI
pnpm add -g vercel
vercel login
vercel whoami
```

When those succeed, the next steps are: create the Supabase project in Frankfurt only if the organization still has a free project slot, link it, push `supabase/migrations`, generate types with `pnpm gen:types`, create the Vercel project connected to this GitHub repo with framework Next.js and region `fra1`, and set no secrets until the owner has filled them.

The migration enables row level security on every table and adds no policies. `anon` and `authenticated` are revoked. The `photos` bucket is private, capped at 5 MB, and limited to image MIME types. `lib/db/database.types.ts` is an interim TypeScript mirror until `pnpm gen:types` can run.

The cron migration that calls the production URL is added after the first deploy. The Pi agent is generated after that deploy, because this environment cannot reach the Pi.

## Daily routine contract

Grokbot is not wired up yet (M4). When it is, a run calls `get_dashboard_state`, then `set_recap`, then `upsert_card` for the affirmation, weekly wins and word of the month, then `upsert_events`, `upsert_task` and `shopping_add`, all with stable `externalId` values such as `recap-2026-11-08`. The same handlers will exist as `POST /api/agent/<tool>`.

## Later

Token rotation, backups and the hardening runbook are M7. Scheduling uses Supabase `pg_cron` and `pg_net` after the production URL exists, not Vercel Cron.
