# Tablou TV

A self-hosted dashboard for a Chromecast. One Next.js app serves the TV page, the phone remote, and the API. Supabase holds the data. Vercel hosts the app. Grokbot writes through `/mcp` or `POST /api/agent/<tool>` with the `AGENT_TOKEN` bearer token.

The TV page renders seven screens from the sample seed: Today, Week, Month, Site, TikTok, Vision board and Home. `/api/state` chooses the screen. Rotation uses each view's weight and dwell, skips an empty view, and gives Today's weight to Week when today has no events. From 06:00 to 23:00 it follows the morning, daytime and evening profiles. Quiet hours, 23:00 to 06:00, show a dimmed clock. An event starting within 30 minutes, or a priority due within 2 hours, puts Today on screen for 2 minutes in every cycle and keeps the priority banner on every view. A birthday or a metric above twice its 7-day average adds a celebration card. Rain forecast within 2 hours of an outdoor event shows a header alert. Each of those rules can be switched off in Config on the phone. `/remote` lists the reason for every rule that is on. A content-free Realtime broadcast asks the TV to refetch; it also polls every 30 seconds. A failed refetch leaves the last screen up. The page reloads itself once, around 04:00 Europe/Bucharest.

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

The phone remote is [http://127.0.0.1:3000/remote](http://127.0.0.1:3000/remote). It asks for `REMOTE_PIN` (4 to 6 digits), locks for 15 minutes after 5 wrong tries, and keeps a signed session for 30 days. From there you can pause, pin or lock a view, dim the TV, edit the layout, change vision-board cards (including a photo), check tasks and shopping, capture an inbox note, switch the rotation rules, and open `/remote/system` for the Pi and the assistant log. A saved change broadcasts a content-free Realtime ping; the TV refetches, and it also polls every 30 seconds. The home screen of the remote shows the current view and the reason for each active rule.

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

Calendar and weather refresh from `/api/cron/calendar` (every 5 minutes) and `/api/cron/weather` (every 30 minutes). Site analytics refresh from `/api/cron/analytics` (every 15 minutes) and TikTok from `/api/cron/tiktok` (every hour). Supabase `pg_cron` and `pg_net` call those routes when both extensions are installed. Both extensions are enabled on the project. The metrics migration is applied, so analytics runs every 15 minutes and TikTok every hour next to the calendar and weather jobs. The routes skip a call that arrives before the interval, so they need no secret. A read that finds stale data refreshes it as well. Vercel Cron is not used.

`ANALYTICS_PROVIDER` is empty. The Site view keeps the last stored metrics, or the sample seed when none exist, and labels them. It does not call Plausible, Umami or GA4 until that variable is `plausible`, `umami` or `ga4` and that provider's keys are set. `ZERNIO_API_KEY` is empty. The TikTok view does the same: last good numbers or the sample seed, with a label, and no request to Zernio. A failed fetch leaves the previous numbers on screen. Neither path throws when a key or a provider is missing. A metric written with `set_metric` is left in place. Numbers older than the refresh interval show how long ago they were read. The view is never blank.

The Pi watchdog is `pi-agent/`. The steps to copy it onto the Raspberry Pi are below. This environment cannot reach the Pi.

## Raspberry Pi watchdog

The Pi only keeps the Chromecast on the dashboard. It does not render the page. The service loops every 15 seconds: an idle or backdrop Chromecast is cast after 60 seconds, DashCast already showing this dashboard is left alone, and any other app (Netflix, YouTube, a phone cast) is left alone. A failed discovery or cast waits, doubling up to 5 minutes, and the process keeps running. Every 60 seconds it posts a heartbeat. The phone page `/remote/system` shows that heartbeat, the Chromecast state, the last cast, and a log tail. Re-cast, restart, and hands-off queue a command the Pi picks up. If no heartbeat arrives for 5 minutes, the page shows an alert.

Use Raspberry Pi OS Lite. The Zero W only has 2.4 GHz Wi-Fi. The Pi and the Chromecast have to be on the same network; guest or isolated Wi-Fi usually blocks discovery. `PI_TOKEN` is already set on Vercel Production and Preview. `TV_TOKEN` is the same value the TV URL uses. Copy both from a place you already store them. Do not commit them and do not paste them into chat.

On your computer, from a checkout of this repo, copy the agent to the Pi. Replace the host if yours is different:

```bash
scp -r pi-agent pi@raspberrypi.local:/tmp/tv-agent
```

On the Pi:

```bash
ssh pi@raspberrypi.local
sudo /tmp/tv-agent/install.sh
sudo editor /etc/tv-agent.toml
sudo systemctl enable --now tv-agent
systemctl status tv-agent
journalctl -u tv-agent -n 50 --no-pager
```

`install.sh` installs Python 3.11 or newer, Avahi, a virtualenv, and the `tv-agent` systemd unit, turns on NTP, and caps the journal at 50 MB. It will not start the service until `pi_token` in `/etc/tv-agent.toml` is non-empty. Set these keys:

```toml
server_url = "https://tv-dashboard-sigma-one.vercel.app"
pi_token = "the PI_TOKEN value"
tv_token = "the TV_TOKEN value"
chromecast_name = "the name from the Google Home app"
chromecast_ip = "192.168.1.50"
```

`chromecast_ip` is optional and is used when mDNS cannot see the Chromecast. The file must stay `root:tv-agent` and mode `640`. After a later edit:

```bash
sudo systemctl restart tv-agent
```

Then open `https://tv-dashboard-sigma-one.vercel.app/remote/system` on the phone. A heartbeat means the Pi is calling home. The alert means it has not.

The decision loop can be checked on any computer, without a Pi or a Chromecast:

```bash
python3 -m unittest discover -s pi-agent/tests -v
```

## Daily routine contract

Grokbot calls the MCP server at `/mcp` (stateless Streamable HTTP, tools only). The same handlers are `POST /api/agent/<tool>`. Send `Authorization: Bearer` with `AGENT_TOKEN`. The token cannot change config, the PIN, or other tokens. The assistant can pin a view for at most 30 minutes and cannot lock the screen.

A run calls `get_dashboard_state`, then `get_inbox` and `route_inbox_item` for anything still waiting, then `set_recap`, then `set_priority`, then `upsert_card` for the affirmation, weekly wins and word of the month, then `upsert_events`, `upsert_task` and `shopping_add`. Use stable ids such as `recap-2026-11-08`, `affirmation-2026-11-08`, `wins-2026-11-08` and `word-2026-11-08`. The same id updates the existing row, so the routine can run twice.

A manual or locked row is left unchanged. A priority needs a one-line reason and expires at the end of the day in Europe/Bucharest unless another time is sent. A manual priority wins. `route_inbox_item` creates an event only when the text has a date and a time; otherwise it creates a task, or leaves the item as needs review when the destination is unclear. A win or progress card needs `evidence` such as `task:done:<id>`. Every call is written to `audit_log`. `undo` restores one of the last 50 assistant writes, and it refuses when a later manual edit is holding that row. `/remote/system` lists those writes and can undo one. Sixty calls per minute are counted in Postgres.

## Later

Token rotation, backups and the hardening runbook are M7. Scheduling uses Supabase `pg_cron` and `pg_net` after the production URL exists, not Vercel Cron.
