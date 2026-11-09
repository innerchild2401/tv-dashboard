import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tv_agent.config import parse_config
from tv_agent.decide import (
    DASH_APP_ID,
    IDLE_APP_ID,
    Command,
    Memory,
    Settings,
    Sight,
    note_failure,
    same_dashboard,
    should_look,
)
from tv_agent.http_client import scrub
from tv_agent.loop import LoopInput, RestartRequested, run_once

URL = "https://tv.example/tv?token=secret"
ROOT = Path(__file__).resolve().parents[1]


def tick(memory, now, sight, commands, casts, beats, settings=None):
    settings = settings or Settings()
    looked = should_look(memory, now, commands)
    seen = sight if looked else Sight(looked=False, found=False)

    def cast():
        casts.append(now)

    def heartbeat(payload):
        beats.append(payload)

    try:
        run_once(
            LoopInput(
                settings=settings,
                memory=memory,
                now=float(now),
                expected_url=URL,
                commands=commands,
                sight=seen,
                cast=cast,
                heartbeat=heartbeat,
                wall_iso="2026-11-08T10:00:00+00:00",
                uptime_seconds=int(now),
                local_ip="192.168.1.20",
            )
        )
    except RestartRequested:
        return "restart"
    return None


class WatchdogTest(unittest.TestCase):
    def test_netflix_is_left_alone_and_closing_it_casts_within_90_seconds(self):
        netflix = Sight(looked=True, found=True, app_id="CA5E8412", app_name="Netflix")
        backdrop = Sight(looked=True, found=True, app_id=IDLE_APP_ID, app_name="Backdrop")
        memory = Memory()
        casts = []
        for now in range(0, 61, 15):
            tick(memory, now, netflix, [], casts, [])
        self.assertEqual(casts, [])

        closed = Memory()
        casts = []
        tick(closed, 0, netflix, [], casts, [])
        for now in (15, 30, 45, 60):
            tick(closed, now, backdrop, [], casts, [])
        self.assertEqual(casts, [])
        tick(closed, 75, backdrop, [], casts, [])
        self.assertEqual(casts, [75])

    def test_power_cycle_restores_the_dashboard_without_a_command(self):
        missing = Sight(looked=True, found=False)
        backdrop = Sight(looked=True, found=True, app_id=IDLE_APP_ID, app_name="Backdrop")
        memory = Memory()
        casts = []
        beats = []
        tick(memory, 0, missing, [], casts, beats)
        self.assertEqual(casts, [])
        self.assertEqual(memory.backoff_until, 15)
        self.assertTrue(beats)
        tick(memory, 10, backdrop, [], casts, beats)
        self.assertEqual(casts, [])
        for now in (15, 30, 45, 60):
            tick(memory, now, backdrop, [], casts, beats)
        self.assertEqual(casts, [])
        tick(memory, 75, backdrop, [], casts, beats)
        self.assertEqual(casts, [75])
        self.assertNotIn("secret", str(beats))

    def test_correct_dashcast_stays_and_a_wrong_url_is_replaced(self):
        memory = Memory()
        casts = []
        showing = Sight(looked=True, found=True, app_id=DASH_APP_ID, app_name="DashCast", dash_url=URL)
        for now in range(0, 181, 15):
            tick(memory, now, showing, [], casts, [])
        self.assertEqual(casts, [])

        wrong = Sight(looked=True, found=True, app_id=DASH_APP_ID, app_name="DashCast", dash_url="https://example.test/other")
        casts = []
        tick(Memory(), 0, wrong, [], casts, [])
        self.assertEqual(casts, [0])

    def test_view_query_and_missing_token_do_not_trigger_recast(self):
        """Classic ?view= navigation must not look like dashboard_wrong (DashCast splash)."""
        self.assertTrue(same_dashboard(URL, URL + "&view=week"))
        self.assertTrue(same_dashboard(URL + "&view=today", "https://tv.example/tv?view=momente&token=secret"))
        self.assertTrue(same_dashboard(URL, "https://tv.example/tv"))
        self.assertFalse(same_dashboard(URL, "https://other.example/tv?token=secret"))
        self.assertFalse(same_dashboard(URL, "https://tv.example/tv?token=other"))

        memory = Memory()
        casts = []
        rotated = Sight(
            looked=True,
            found=True,
            app_id=DASH_APP_ID,
            app_name="DashCast",
            dash_url=URL + "&view=week",
        )
        for now in range(0, 181, 15):
            tick(memory, now, rotated, [], casts, [])
        self.assertEqual(casts, [])

        # DashCast app up, URL unknown → stay put (do not splash-recast).
        unknown = Sight(looked=True, found=True, app_id=DASH_APP_ID, app_name="DashCast", dash_url=None)
        casts = []
        tick(Memory(), 0, unknown, [], casts, [])
        self.assertEqual(casts, [])

    def test_dashboard_refresh_re_casts_when_configured(self):
        showing = Sight(looked=True, found=True, app_id=DASH_APP_ID, app_name="DashCast", dash_url=URL)
        memory = Memory()
        memory.last_cast_mono = 0
        casts = []
        settings = Settings(dashboard_refresh_seconds=1800)
        for now in range(0, 1800, 15):
            tick(memory, now, showing, [], casts, [], settings=settings)
        self.assertEqual(casts, [])
        tick(memory, 1800, showing, [], casts, [], settings=settings)
        self.assertEqual(casts, [1800])

    def test_cast_now_overrides_netflix_and_release_blocks_the_automatic_cast(self):
        netflix = Sight(looked=True, found=True, app_id="CA5E8412", app_name="Netflix")
        casts = []
        tick(Memory(), 0, netflix, [Command("1", "cast_now")], casts, [])
        self.assertEqual(casts, [0])

        backdrop = Sight(looked=True, found=True, app_id=IDLE_APP_ID, app_name="Backdrop")
        memory = Memory()
        casts = []
        commands = [Command("2", "release", 30)]
        for now in range(0, 601, 15):
            tick(memory, now, backdrop, commands, casts, [])
            commands = []
        self.assertEqual(casts, [])

    def test_restart_exits_and_a_failed_cast_backs_off_without_raising(self):
        backdrop = Sight(looked=True, found=True, app_id=None, app_name=None)
        memory = Memory()
        outcome = tick(memory, 0, backdrop, [Command("1", "restart_service")], [], [])
        self.assertEqual(outcome, "restart")

        failed = Memory()

        def boom():
            raise RuntimeError("cast https://tv.example/tv?token=secret failed")

        run_once(
            LoopInput(
                settings=Settings(),
                memory=failed,
                now=60,
                expected_url=URL,
                commands=[Command("1", "cast_now")],
                sight=Sight(looked=True, found=True, app_id="CA5E8412", app_name="Netflix"),
                cast=boom,
                heartbeat=lambda _payload: None,
                wall_iso="2026-11-08T10:00:00+00:00",
                uptime_seconds=60,
                local_ip=None,
            )
        )
        self.assertEqual(failed.backoff_step, 15)
        self.assertNotIn("secret", " ".join(failed.log))
        self.assertEqual(scrub("Bearer secret token=secret"), "Bearer redacted token=redacted")

    def test_backoff_doubles_until_five_minutes(self):
        memory = Memory()
        settings = Settings()
        now = 0
        steps = []
        for _ in range(8):
            note_failure(memory, now, settings)
            steps.append(memory.backoff_step)
            now = memory.backoff_until
        self.assertEqual(steps, [15, 30, 60, 120, 240, 300, 300, 300])
        self.assertFalse(should_look(memory, now - 1, []))
        self.assertTrue(should_look(memory, now, []))
        self.assertTrue(should_look(memory, 0, [Command("1", "cast_now")]))

    def test_example_config_uses_the_spec_intervals(self):
        example = (ROOT / "tv-agent.toml.example").read_text(encoding="utf-8")
        config = parse_config(example)
        self.assertEqual(config.server_url, "https://tv-dashboard-sigma-one.vercel.app")
        self.assertEqual(config.dashcast_force, False)
        self.assertEqual(config.dashcast_reload_seconds, 1800)
        self.assertEqual(config.settings(), Settings(dashboard_refresh_seconds=0))
        self.assertEqual(config.problems(), ["pi_token", "tv_token", "chromecast"])
        filled = example.replace('pi_token = ""', 'pi_token = "pi-value"', 1)
        filled = filled.replace('tv_token = ""', 'tv_token = "tv-value"', 1)
        filled = filled.replace('chromecast_name = ""', 'chromecast_name = "Living Room"', 1)
        ready = parse_config(filled)
        self.assertEqual(ready.problems(), [])
        self.assertIn("/tv?token=", ready.tv_url())
        self.assertNotIn("pi-value", " ".join(ready.problems()))
        forced = parse_config(filled + "\ndashcast_force = true\n")
        self.assertTrue(forced.dashcast_force)
        self.assertEqual(forced.settings().dashboard_refresh_seconds, 1800)


if __name__ == "__main__":
    unittest.main()
