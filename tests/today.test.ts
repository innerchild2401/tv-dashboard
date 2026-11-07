import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectToday } from "../lib/today/project";
import { sampleSchedule } from "../lib/today/schedule";

describe("Today projection", () => {
  it("marks breakfast as in progress at 08:00 Bucharest", () => {
    const view = projectToday(sampleSchedule, new Date("2026-11-07T06:00:00.000Z"));
    assert.equal(view.lead, "today");
    assert.equal(view.clock, "08:00");
    assert.equal(view.agenda[0]?.state, "current");
    assert.equal(view.agenda[0]?.title, "Mic dejun");
    assert.equal(view.nowBeforeId, view.agenda[0]?.id);
    assert.equal(view.nextEvent?.title, "Mic dejun");
    assert.equal(view.nextEvent?.countdown, "15 min");
    assert.equal(view.priority?.text, "Ridică pachetul de la easybox");
    assert.equal(view.agenda[0]?.person?.name, "Alex");
  });

  it("puts the now line before dinner at 18:00", () => {
    const view = projectToday(sampleSchedule, new Date("2026-11-07T16:00:00.000Z"));
    assert.equal(view.lead, "today");
    assert.equal(view.clock, "18:00");
    assert.equal(view.agenda.find((item) => item.title === "Piață")?.state, "past");
    assert.equal(view.nextEvent?.title, "Cină");
    assert.equal(view.nextEvent?.countdown, "1 h 00 min");
    assert.equal(view.nowBeforeId, view.agenda.find((item) => item.title === "Cină")?.id);
  });

  it("leads with tomorrow from 20:00 and keeps the priority", () => {
    const view = projectToday(sampleSchedule, new Date("2026-11-07T18:00:00.000Z"));
    assert.equal(view.lead, "tomorrow");
    assert.equal(view.clock, "20:00");
    assert.equal(view.showNowLine, false);
    assert.equal(view.agenda[0]?.title, "Control medical");
    assert.equal(view.nextEvent?.countdown, "14 h 00 min");
    assert.ok(view.priority);
    assert.equal(view.nextDays[0]?.titles[0], "Cumpărături");
    assert.equal(view.views.find((item) => item.active)?.dwellLabel, "45s");
  });
});
