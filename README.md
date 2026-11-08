# Tablou TV

A self-hosted dashboard for a Chromecast. One Next.js app serves the TV page, the phone remote, and the API. Supabase holds the data. Vercel hosts the app. Grokbot writes through `/mcp` or `POST /api/agent/<tool>` with the `AGENT_TOKEN` bearer token.

The TV page renders seven screens from the sample seed: Today, Week, Month, Site, TikTok, Vision board and Home. `/api/state` chooses the screen. Rotation uses each view's weight and dwell, skips an empty view, and gives Today's weight to Week when today has no events. A content-free Realtime broadcast asks the TV to refetch; it also polls every 30 seconds. A failed refetch leaves the last screen up. The page reloads itself once, around 04:00 Europe/Bucharest. Quiet hours, interrupts and time-of-day profiles are not applied yet. TikTok and analytics keys are not wired.

Weather comes from Open-Meteo for the location in Config (default Constanța). It refreshes every 30 minutes. If a reading has never succeeded, the header hides the weather block. A later failure keeps the last reading.

Calendar feeds are read from `ICAL_URL_ALEX` and `ICAL_URL_MARA`. When a variable is empty, that person's seed events stay on screen and the app does not crash. A set URL is fetched every 5 minutes with `If-None-Match`. A failed fetch keeps the last good events. Recurring events are expanded 45 days either side of today, including time zones and all-day dates. Week is a sliding window with today fixed in column 3. Month is a Monday-start grid.

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

The phone remote is [http://127.0.0.1:3000/remote](http://127.0.0.1:3000/remote). It asks for `REMOTE_PIN` (4 to 6 digits), locks for 15 minutes after 5 wrong tries, and keeps a signed session for 30 days. From there you can pause, pin or lock a view, dim the TV, edit the layout, change vision-board cards (including a photo), check tasks and shopping, and capture an inbox note. A saved change broadcasts a content-free Realtime ping; the TV refetches, and it also polls every 30 seconds. Quiet hours, interrupts and time-of-day profiles can be edited and are stored. They are not applied to rotation yet.

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

The Vercel project is `tv-dashboard`, framework Next.js, function region `fra1`, connected to this GitHub repo. Production is [https://tv-dashboard-sigma-one.vercel.app](https://tv-dashboard-sigma-one.vercel.app).

Wins-card evidence is enforced with a trigger. Postgres does not allow a subquery inside a check constraint.

Calendar and weather refresh from `/api/cron/calendar` (every 5 minutes) and `/api/cron/weather` (every 30 minutes). Supabase `pg_cron` and `pg_net` call those routes. The routes skip a call that arrives before the interval, so they need no secret. A read that finds stale data refreshes it as well. The Pi agent is generated later, because this environment cannot reach the Pi.

## Daily routine contract

Grokbot calls the MCP server at `/mcp` (stateless Streamable HTTP, tools only). The same handlers are `POST /api/agent/<tool>`. Send `Authorization: Bearer` with `AGENT_TOKEN`. The token cannot change config, the PIN, or other tokens. The assistant can pin a view for at most 30 minutes and cannot lock the screen.

A run calls `get_dashboard_state`, then `get_inbox` and `route_inbox_item` for anything still waiting, then `set_recap`, then `set_priority`, then `upsert_card` for the affirmation, weekly wins and word of the month, then `upsert_events`, `upsert_task` and `shopping_add`. Use stable ids such as `recap-2026-11-08`, `affirmation-2026-11-08`, `wins-2026-11-08` and `word-2026-11-08`. The same id updates the existing row, so the routine can run twice.

A manual or locked row is left unchanged. A priority needs a one-line reason and expires at the end of the day in Europe/Bucharest unless another time is sent. A manual priority wins. `route_inbox_item` creates an event only when the text has a date and a time; otherwise it creates a task, or leaves the item as needs review when the destination is unclear. A win or progress card needs `evidence` such as `task:done:<id>`. Every call is written to `audit_log`. `undo` restores one of the last 50 assistant writes, and it refuses when a later manual edit is holding that row. The phone's system page, where those undos will also appear, is not part of this milestone. Sixty calls per minute are counted in Postgres.

## Later

Token rotation, backups and the hardening runbook are M7. Scheduling uses Supabase `pg_cron` and `pg_net` after the production URL exists, not Vercel Cron.
