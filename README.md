# Tablou TV

A self-hosted dashboard for a Chromecast. One Next.js app serves the TV page, the phone remote, the API, and the MCP endpoint. Supabase holds the data. Vercel hosts the app. Grokbot writes through `/mcp` or `POST /api/agent/<tool>` with the `AGENT_TOKEN` bearer token.

The TV page renders five screens: Today, Week, Momente, Victorii (vision board), and Home. `/api/state` chooses the screen with a simple round-robin (120 seconds each, no immediate repeat). Empty views are skipped when `skipEmpty` is on. Quiet hours, 23:00 to 06:00 Europe/Bucharest, show a dimmed clock. An event starting within 30 minutes, or a priority due within 2 hours, puts Today on screen for 2 minutes in every cycle and keeps the priority banner on every view. A birthday adds a celebration card on Vision. Rain forecast within 2 hours of an outdoor event shows a header alert. Each rule can be switched off on the phone. `/remote` lists the reason for every rule that is on. A content-free Realtime broadcast asks the TV to refetch. It also polls every 30 seconds. A failed refetch leaves the last screen up. The page reloads itself once, around 04:00 Europe/Bucharest.

## Defaults

| Choice | Value |
| --- | --- |
| Package manager | pnpm 10 (`packageManager` in `package.json`) |
| Node | 20 or newer |
| Framework | Next.js (App Router, TypeScript) |
| GitHub repository | private `tv-dashboard` |
| Supabase region | Central EU (Frankfurt, `eu-central-1`) |
| Supabase project | `xbqcywzbykstjlnrrycl` |
| Vercel project | `tv-dashboard`, function region `fra1` |
| Production | https://tv-dashboard-sigma-one.vercel.app |
| UI language | Romanian |
| Time zone | Europe/Bucharest, 24-hour clock, weeks start Monday |
| Design size | 1280×720, uniform letterbox into the Cast/TV viewport (×1.5 on bare 1080p; ×1.35 inside the 10% overscan-safe area) |
| Scheduling | Supabase `pg_cron` and `pg_net`, not Vercel Cron |

## Fresh deploy

These steps are enough to put this repository on a new machine and on Vercel. Do not commit a secret. Do not invent an iCal address. Leave calendar URLs empty until you have them.

1. Install Node 20 or newer, pnpm 10, the GitHub CLI, the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), and the [Vercel CLI](https://vercel.com/docs/cli). Sign in: `gh auth status`, `supabase login`, `vercel whoami`.

2. Clone the private repository and install:

```bash
git clone git@github.com:innerchild2401/tv-dashboard.git
cd tv-dashboard
pnpm install
```

3. Copy the env template and generate the tokens. The command prints values and does not write a file. Choose the PIN yourself. It is 4 to 6 digits.

```bash
cp .env.example .env.local
pnpm gen:secrets
```

Paste `TV_TOKEN`, `AGENT_TOKEN`, `PI_TOKEN`, and `SESSION_SECRET` into `.env.local`. Put the same names in the Vercel project for **Production and Preview**. `REMOTE_PIN` is not generated.

4. Fill the Supabase values from Project Settings → API:

| Variable | Where it goes | Required before the first deploy |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Vercel Production and Preview | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, Vercel Production and Preview | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, Vercel Production and Preview | yes |
| `SUPABASE_DB_PASSWORD` | `.env.local` only, for `supabase link` | for linking |
| `TV_TOKEN`, `AGENT_TOKEN`, `PI_TOKEN` | `.env.local`, Vercel Production and Preview | yes |
| `REMOTE_PIN` | `.env.local`, Vercel Production and Preview | yes |
| `SESSION_SECRET` | `.env.local`, Vercel Production and Preview | yes |
| `ICAL_URL_ALEX` | `.env.local`, Vercel Production and Preview | no, until you copy it from Google Calendar |
| `ZERNIO_API_KEY` | `.env.local`, Vercel Production and Preview | no, until you have a Zernio key |
| `ANALYTICS_PROVIDER` and that provider's keys | `.env.local`, Vercel Production and Preview | no, until you choose `plausible`, `umami`, or `ga4` |

The anon key is only for the realtime nudge. It has no table access. The service role key stays on the server. Never prefix it with `NEXT_PUBLIC_`.

5. Link the database and apply the migrations. In the Supabase dashboard, Database → Extensions, enable `pg_cron` and `pg_net` first. The project region is Central EU (Frankfurt).

```bash
supabase link --project-ref xbqcywzbykstjlnrrycl
supabase db push
```

The link command asks for the database password. Keep it in `.env.local` as `SUPABASE_DB_PASSWORD`. If `db push` stops on `create extension pg_cron`, enable that extension in the dashboard and run `db push` again.

6. On a database that has no household rows yet, load the sample seed. Skip this when you are restoring a backup.

```bash
supabase db query --linked -f supabase/seed.sql
```

If that CLI says `--linked` is unknown, use `--remote` in its place.

7. The Vercel project `tv-dashboard` is connected to this GitHub repository, framework Next.js, function region `fra1` (`vercel.json`). Pushing `main` deploys production. For a project that is not connected yet:

```bash
vercel link
vercel --prod
```

Set every required variable in the step 4 table on Production and on Preview before that deploy. Preview currently still needs `SUPABASE_SERVICE_ROLE_KEY` and `REMOTE_PIN` on the existing project.

8. Smoke, with no token sent:

```bash
curl -sS -D - https://tv-dashboard-sigma-one.vercel.app/api/health -o /tmp/health.json
curl -sS -o /dev/null -w "%{http_code}\n" https://tv-dashboard-sigma-one.vercel.app/api/state
curl -sS -D - -o /dev/null https://tv-dashboard-sigma-one.vercel.app/tv
curl -sS -D - -o /dev/null https://tv-dashboard-sigma-one.vercel.app/remote
```

`/api/health` is `200` and `{"ok":true}`. `/api/state` without a token is `401`. The `/tv` response has a `Content-Security-Policy` and no `frame-ancestors` directive, and it does not send `X-Frame-Options`. `/remote` sends `frame-ancestors 'none'`. Both send `Referrer-Policy: no-referrer`.

Open `/tv?token=` with `TV_TOKEN` on the Chromecast. Open `/remote` on the phone and sign in with `REMOTE_PIN`.

## Scheduling

Refresh is scheduled in Supabase with `pg_cron` and `pg_net`. Vercel Cron is not used. The routes are idempotent and skip a call that arrives before the source interval, so they take no secret. A read that finds stale data refreshes it as well.

Both extensions are enabled on project `xbqcywzbykstjlnrrycl`. The migrations schedule two jobs against `https://tv-dashboard-sigma-one.vercel.app`:

| Job | Schedule | Route |
| --- | --- | --- |
| `tv-dashboard-calendar` | `*/5 * * * *` | `/api/cron/calendar` |
| `tv-dashboard-weather` | `*/30 * * * *` | `/api/cron/weather` |

The calendar feed is `ICAL_URL_ALEX`. An empty variable leaves Alex's seed events on screen. Weather is Open-Meteo for the place in Config (default Constanța) and needs no key. Site and TikTok screens (and their cron jobs) were removed; `set_metric` can still write arbitrary metric keys if needed.

If the app URL changes, edit the URLs in `supabase/migrations` before `supabase db push`.

## Rate limits

Assistant tool calls, on `/mcp` and on `POST /api/agent/<tool>`, stop at 60 requests in a rolling minute. The count is the number of `audit_log` rows in Postgres, so serverless instances share it. There is one `AGENT_TOKEN`, and that token is the bucket. The next call returns `{ ok: false, reason: "too many requests, try again in a minute" }`. The REST mirror also returns HTTP 429 with `Retry-After: 60`. Every call, including a refusal, is still written to `audit_log`.

The phone PIN locks for 15 minutes after 5 wrong tries. The count is the `pin_guard` row in Postgres. A correct PIN clears it.

The cron routes do not use a token. A call that arrives before the source interval returns without fetching the upstream.

## Rotate a token or the PIN

Rotation means changing the variable in Vercel and redeploying. `pnpm gen:secrets` prints a new `TV_TOKEN`, `AGENT_TOKEN`, `PI_TOKEN`, and `SESSION_SECRET`. Copy only the one you are rotating. Do not commit the output.

1. Vercel → Project → Settings → Environment Variables. Update the name on Production and Preview.
2. Redeploy production so the new value is loaded. The dashboard button Redeploy does this. A push to `main` does too.
3. Update the other place that value lives:

| Variable | Also update |
| --- | --- |
| `TV_TOKEN` | `tv_token` in `/etc/tv-agent.toml` on the Pi, then `sudo systemctl restart tv-agent`. The cast URL changes. An old cast stops loading. |
| `PI_TOKEN` | `pi_token` in the same file, then restart `tv-agent`. |
| `AGENT_TOKEN` | The bearer token in the Grokbot MCP client. |
| `SESSION_SECRET` | Nothing else to paste. Every phone is signed out. The Realtime channel name is derived from this secret, so the TV and the phone join the new channel on their next full load. The TV reloads itself around 04:00, or the Pi can cast the page again. |
| `REMOTE_PIN` | Nothing to generate. Choose a new 4 to 6 digit PIN, set it on Production and Preview, and redeploy. Sessions that are already signed in stay valid for up to 30 days. Rotate `SESSION_SECRET` as well when those sessions should die now. |

A PIN change does not clear a lockout. In the Supabase SQL editor:

```sql
update public.pin_guard
set failures = 0, locked_until = null
where id = 1;
```

## Backup and restore

The schema, row level security, the private `photos` bucket, and the cron jobs live in `supabase/migrations`. A backup is the public rows plus the objects in that bucket. `pnpm backup` reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` and writes `backups/latest/`. That folder holds household data. It is gitignored. Do not commit it. Copy it somewhere safe.

```bash
pnpm backup
```

Another folder: `pnpm backup -- --out backups/2026-11-08`.

Restore into a **clean** Supabase project, not into the project you just copied, unless you pass `--replace` and mean to wipe it.

1. Create a project in Central EU (Frankfurt). Enable `pg_cron` and `pg_net` under Database → Extensions.
2. Point a shell at the new project and apply the schema. Do not run `supabase/seed.sql`. The migrations already insert the single control rows, and the restore replaces them.

```bash
supabase link --project-ref <new-project-ref>
supabase db push
```

3. Put the new project's URL, anon key, and service role key in `.env.local`. Leave the tokens and the PIN as they are when the Vercel app URL is staying.
4. Load the backup. The script deletes public rows on the target, inserts the backup, and uploads photos into the private `photos` bucket. It refuses when the target ref is the source ref.

```bash
pnpm restore -- --yes
```

5. In Vercel, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on Production and Preview to the new project. Redeploy. The TV URL and the tokens stay the same.
6. Confirm the cron jobs:

```sql
select jobname, schedule from cron.job order by jobname;
```

Expect the four jobs in the scheduling table. They call the production URL through `pg_net`. Then repeat the smoke checks. `/api/health` returns 200.

A restore that stops halfway can be run again with `--yes`. It clears the public tables before loading.

## Local setup

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000/tv. In development, with `TV_TOKEN` empty, the page shows the sample board. A production process refuses `/tv` until `TV_TOKEN` is set, then the page expects `?token=` to match it.

The phone remote is http://127.0.0.1:3000/remote. It asks for `REMOTE_PIN`, locks for 15 minutes after 5 wrong tries, and keeps a signed session for 30 days. From there you can pause, pin, or lock a view, dim the TV, edit the layout and the rotation rules, change vision-board cards, check tasks and shopping, capture an inbox note, and open `/remote/system`.

```bash
pnpm test
pnpm lint
pnpm build
```

## Raspberry Pi watchdog

The Pi only keeps the Chromecast on the dashboard. It does not render the page. The service loops every 15 seconds: an idle or backdrop Chromecast is cast after 60 seconds, DashCast already showing this dashboard is left alone, and any other app is left alone. A failed discovery or cast waits, doubling up to 5 minutes. Every 60 seconds it posts a heartbeat. `/remote/system` shows that heartbeat. If none arrives for 5 minutes, the page shows an alert.

Use Raspberry Pi OS Lite. The Zero W only has 2.4 GHz Wi-Fi. The Pi and the Chromecast have to be on the same network. Copy `PI_TOKEN` and `TV_TOKEN` from the place you already store them. Do not commit them and do not paste them into chat.

On your computer, from a checkout of this repo:

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

`install.sh` installs Python 3.11 or newer, Avahi, a virtualenv, and the `tv-agent` unit, turns on NTP, and caps the journal at 50 MB. It will not start until `pi_token` is non-empty. Set these keys:

```toml
server_url = "https://tv-dashboard-sigma-one.vercel.app"
pi_token = "the PI_TOKEN value"
tv_token = "the TV_TOKEN value"
chromecast_name = "the name from the Google Home app"
chromecast_ip = "192.168.1.50"
```

`chromecast_ip` is optional. The file must stay `root:tv-agent` and mode `640`. After a later edit, `sudo systemctl restart tv-agent`.

The decision loop can be checked without a Pi:

```bash
python3 -m unittest discover -s pi-agent/tests -v
```

## Daily routine contract

Grokbot calls `/mcp` (stateless Streamable HTTP, tools only). The same handlers are `POST /api/agent/<tool>`. Send `Authorization: Bearer` with `AGENT_TOKEN`. The token cannot change config, the PIN, or other tokens. The assistant can pin a view for at most 30 minutes and cannot lock the screen.

A run calls `get_view_design` (or `get_schema`) first, then `get_dashboard_state`, then `get_inbox` and `route_inbox_item` for anything still waiting, then `set_recap`, then `set_priority`, then `upsert_card` for the affirmation, weekly wins, and word of the month, then `upsert_events`, `upsert_task`, and `shopping_add`. Use stable ids such as `recap-2026-11-08`, `affirmation-2026-11-08`, `wins-2026-11-08`, and `word-2026-11-08`. The same id updates the existing row, so the routine can run twice.

### Design tools (Grokbot)

Call `get_view_design` with an optional `viewId` (`today` | `week` | `momente` | `vision` | `home`) before editing a screen. It returns hard constraints and allowed knobs. `get_schema` embeds the same payload under `schema.design`. Stay inside those limits — no free-form HTML. Auth is still `Authorization: Bearer AGENT_TOKEN` on `/mcp` and `POST /api/agent/<tool>`.

Victorii (view id `vision`) is a data-driven 4×3 board (max 12 cards). On `upsert_card` pass layout knobs: `grid` `{col,row,colSpan?,rowSpan?}` (spans max 2), `tilt` (−3…3), `fontScale` (`sm`|`md`|`lg`). Photos always use the polaroid frame. Call `upsert_card` with `kind: "photo"` and an HTTPS `image_url` (jpeg/png/webp/gif, max 5 MB). The server downloads the image into the private `photos` bucket and stores `data.storagePath`. Non-images and oversized files are refused. Prefer `https://`. Phone remote camera/gallery uploads still write the same `storagePath` field. Example:

```json
{
  "externalId": "photo-vacanta-2026",
  "viewId": "vision",
  "kind": "photo",
  "title": "Vacanță",
  "image_url": "https://cdn.example/vacation.jpg",
  "grid": { "col": 0, "row": 0, "colSpan": 2, "rowSpan": 2 },
  "tilt": -2,
  "fontScale": "md",
  "data": { "alt": "Familie la munte" }
}
```

`get_schema` returns the same photo contract under `schema.photos` (MCP `/mcp` and `POST /api/agent/get_schema`).

Momente (view id `momente`) shows countdown spotlights — all active items up to 12, with gallery/packed layouts for 7+. Call `get_schema` / `get_view_design` for the contract, or use `upsert_spotlight` / `delete_spotlight`. Countdown is whole Europe/Bucharest calendar days until `startsAt` (0 = azi). Seeded samples use `spotlight-vacanta-sample` and `spotlight-deadline-sample`; delete those external ids to clear them.

Acasă (view id `home`) is a post-it board of tasks, grocery items, and family messages. Call `get_schema` for `schema.home`, or use `upsert_task` / `delete_task`, `shopping_add` / `shopping_check` / `shopping_delete`, and `upsert_message` / `delete_message`. Message colors are `butter | peach | mint | sky | rose | lemon`. Seeded sample message external id: `msg-welcome`.

### Chromecast / Pi notes (flicker)

Hard rules from pychromecast `DashCastController` / AlexxIT DashCast:

- **`dashcast_force = false`** on the Pi. `force=true` disables `reload_seconds` and makes every later `load_url()` relaunch the DashCast app (the splash flash). `/tv` allows iframe embedding (`frame-ancestors *`, no `X-Frame-Options`).
- **Cast once; rotate in-page** via `/api/state`. Never `load_url` for Azi→Week→… or as keepalive. Recast only on cold start / idle / truly wrong dashboard / explicit `cast_now`.
- **`dashcast_reload_seconds = 1800`** (or 300–540 if Cast idle-timeouts are aggressive) with `force=false` for soft page reload. Leave `dashboard_refresh_seconds = 0` — that path is a Pi re-cast for `force=true` only.
- Stuck views are a client/rotation bug — fix soft advance, do not “un-stick” with DashCast relaunch.

After pulling a new `pi-agent`, restart `tv-agent`. Heartbeat `version` should read `2` or newer on `/remote/system`. No token values belong in git.

A manual or locked row is left unchanged. A priority needs a one-line reason and expires at the end of the day in Europe/Bucharest unless another time is sent. A manual priority wins. `route_inbox_item` creates an event only when the text has a date and a time. Otherwise it creates a task, or leaves the item as needs review when the destination is unclear. A win or progress card needs `evidence` such as `task:done:<id>`. `undo` restores one of the last 50 assistant writes, and it refuses when a later manual edit is holding that row. `/remote/system` lists those writes and can undo one.
