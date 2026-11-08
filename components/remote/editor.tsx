"use client";

import { useState } from "react";
import { ro, VIEW_IDS, type ViewId } from "@/i18n/ro";
import { personSlug } from "@/lib/remote/config";
import { ACCENT_CHOICES, accentColor } from "@/lib/theme/accent";
import type { DashboardConfig } from "@/lib/state/types";
import { useRemote } from "@/components/remote/provider";

const PROFILE_LABELS: Record<string, string> = {
  morning: ro.remote.morning,
  daytime: ro.remote.daytime,
  evening: ro.remote.evening,
};

export function Editor() {
  const { board, send } = useRemote();
  const [config, setConfig] = useState<DashboardConfig>(board.config);
  const [dirty, setDirty] = useState(false);
  const views = [...config.views].sort((left, right) => left.order - right.order);
  const accent = accentColor(config.theme.accent);

  function update(next: DashboardConfig) {
    setConfig(next);
    setDirty(true);
  }

  function move(index: number, direction: -1 | 1) {
    const copy = [...views];
    const target = index + direction;
    if (target < 0 || target >= copy.length) return;
    const [item] = copy.splice(index, 1);
    if (!item) return;
    copy.splice(target, 0, item);
    update({ ...config, views: copy.map((view, order) => ({ ...view, order: order + 1 })) });
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void send("/api/remote/config", config, "PUT").then((ok) => {
          if (ok) setDirty(false);
        });
      }}
    >
      <h1>{ro.viewsNav}</h1>
      {views.map((view, index) => (
        <article key={view.id} className="card-row">
          <strong>{ro.views[view.id as ViewId] ?? view.id}</strong>
          <label className="check">
            <input
              type="checkbox"
              checked={view.enabled}
              onChange={(event) => {
                const next = views.map((item) => (item.id === view.id ? { ...item, enabled: event.target.checked } : item));
                update({ ...config, views: next });
              }}
            />
            {ro.remote.enabled}
          </label>
          <label>
            {ro.remote.dwell}
            <input
              type="number"
              min={10}
              max={600}
              value={view.dwellSeconds}
              onChange={(event) => {
                const dwellSeconds = Number(event.target.value);
                update({
                  ...config,
                  views: views.map((item) => (item.id === view.id ? { ...item, dwellSeconds } : item)),
                });
              }}
            />
          </label>
          <label>
            {ro.weight}
            <input
              type="number"
              min={1}
              max={20}
              value={view.weight}
              onChange={(event) => {
                const weight = Number(event.target.value);
                update({
                  ...config,
                  views: views.map((item) => (item.id === view.id ? { ...item, weight } : item)),
                });
              }}
            />
          </label>
          <div className="pair">
            <button type="button" onClick={() => move(index, -1)} aria-label={ro.remote.up}>
              {ro.remote.up}
            </button>
            <button type="button" onClick={() => move(index, 1)} aria-label={ro.remote.down}>
              {ro.remote.down}
            </button>
          </div>
        </article>
      ))}

      <h2>{ro.remote.theme}</h2>
      <div className="pair">
        <button type="button" aria-pressed={config.theme.mode === "dark"} onClick={() => update({ ...config, theme: { ...config.theme, mode: "dark" } })}>
          {ro.remote.modeDark}
        </button>
        <button type="button" aria-pressed={config.theme.mode === "light"} onClick={() => update({ ...config, theme: { ...config.theme, mode: "light" } })}>
          {ro.remote.modeLight}
        </button>
      </div>
      <div className="swatches" aria-label={ro.remote.accent}>
        {ACCENT_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="swatch"
            style={{ background: choice.color }}
            aria-label={choice.id}
            aria-pressed={accent === choice.color}
            onClick={() => update({ ...config, theme: { ...config.theme, accent: choice.color } })}
          />
        ))}
      </div>

      <h2>{ro.remote.people}</h2>
      {config.people.map((person) => (
        <article key={person.id} className="card-row">
          <label>
            {ro.remote.name}
            <input
              value={person.name}
              onChange={(event) =>
                update({
                  ...config,
                  people: config.people.map((item) => (item.id === person.id ? { ...item, name: event.target.value } : item)),
                })
              }
            />
          </label>
          <label>
            {ro.remote.color}
            <input
              type="color"
              value={person.color}
              onChange={(event) =>
                update({
                  ...config,
                  people: config.people.map((item) => (item.id === person.id ? { ...item, color: event.target.value.toUpperCase() } : item)),
                })
              }
            />
          </label>
          {config.people.length > 1 ? (
            <button
              type="button"
              onClick={() => update({ ...config, people: config.people.filter((item) => item.id !== person.id) })}
            >
              {ro.remote.remove}
            </button>
          ) : null}
        </article>
      ))}
      <button
        type="button"
        onClick={() => {
          const name = ro.remote.addPerson;
          update({
            ...config,
            people: [...config.people, { id: personSlug(name, config.people.map((person) => person.id)), name, color: "#8BDCA0" }],
          });
        }}
      >
        {ro.remote.addPerson}
      </button>

      <h2>{ro.remote.quiet}</h2>
      <div className="pair">
        <label>
          {ro.remote.from}
          <input type="time" value={config.quietHours.start} onChange={(event) => update({ ...config, quietHours: { ...config.quietHours, start: event.target.value } })} />
        </label>
        <label>
          {ro.remote.to}
          <input type="time" value={config.quietHours.end} onChange={(event) => update({ ...config, quietHours: { ...config.quietHours, end: event.target.value } })} />
        </label>
      </div>
      <h2>{ro.remote.rulesTitle}</h2>
      {(
        [
          ["quietHours", ro.remote.ruleQuiet],
          ["timeOfDay", ro.remote.ruleTime],
          ["eventProximity", ro.remote.ruleEvent],
          ["priorityBanner", ro.remote.rulePriority],
          ["celebrations", ro.remote.ruleCelebration],
          ["weatherAlert", ro.remote.ruleWeather],
          ["skipEmpty", ro.remote.skipEmpty],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="rule">
          <input
            type="checkbox"
            checked={config.rules[key]}
            onChange={(event) => update({ ...config, rules: { ...config.rules, [key]: event.target.checked } })}
          />
          {label}
        </label>
      ))}
      <label>
        {ro.remote.leadHour}
        <input
          type="number"
          min={0}
          max={23}
          value={config.rules.todayLeadTomorrowHour}
          onChange={(event) =>
            update({ ...config, rules: { ...config.rules, todayLeadTomorrowHour: Number(event.target.value) } })
          }
        />
      </label>

      <h2>{ro.remote.location}</h2>
      <label>
        {ro.remote.name}
        <input value={config.location.name} onChange={(event) => update({ ...config, location: { ...config.location, name: event.target.value } })} />
      </label>
      <div className="pair">
        <label>
          {ro.remote.latitude}
          <input
            type="number"
            step="0.0001"
            value={config.location.latitude}
            onChange={(event) => update({ ...config, location: { ...config.location, latitude: Number(event.target.value) } })}
          />
        </label>
        <label>
          {ro.remote.longitude}
          <input
            type="number"
            step="0.0001"
            value={config.location.longitude}
            onChange={(event) => update({ ...config, location: { ...config.location, longitude: Number(event.target.value) } })}
          />
        </label>
      </div>

      <h2>{ro.remote.profiles}</h2>
      <p>{ro.remote.profileNote}</p>
      {config.profiles.map((profile) => (
        <fieldset key={profile.id}>
          <legend>{PROFILE_LABELS[profile.id] ?? profile.id}</legend>
          <div className="pair">
            <label>
              {ro.remote.from}
              <input
                type="time"
                value={profile.start}
                onChange={(event) =>
                  update({
                    ...config,
                    profiles: config.profiles.map((item) => (item.id === profile.id ? { ...item, start: event.target.value } : item)),
                  })
                }
              />
            </label>
            <label>
              {ro.remote.to}
              <input
                type="time"
                value={profile.end}
                onChange={(event) =>
                  update({
                    ...config,
                    profiles: config.profiles.map((item) => (item.id === profile.id ? { ...item, end: event.target.value } : item)),
                  })
                }
              />
            </label>
          </div>
          {profile.views.map((view) => (
            <div key={view.id} className="pair">
              <span>{VIEW_IDS.includes(view.id as ViewId) ? ro.views[view.id as ViewId] : view.id}</span>
              <label>
                {ro.weight}
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={view.weight}
                  onChange={(event) => {
                    const weight = Number(event.target.value);
                    update({
                      ...config,
                      profiles: config.profiles.map((item) =>
                        item.id === profile.id
                          ? { ...item, views: item.views.map((entry) => (entry.id === view.id ? { ...entry, weight } : entry)) }
                          : item,
                      ),
                    });
                  }}
                />
              </label>
              <label>
                {ro.remote.dwell}
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={view.dwellSeconds}
                  onChange={(event) => {
                    const dwellSeconds = Number(event.target.value);
                    update({
                      ...config,
                      profiles: config.profiles.map((item) =>
                        item.id === profile.id
                          ? { ...item, views: item.views.map((entry) => (entry.id === view.id ? { ...entry, dwellSeconds } : entry)) }
                          : item,
                      ),
                    });
                  }}
                />
              </label>
            </div>
          ))}
        </fieldset>
      ))}
      <button type="submit" disabled={!dirty}>
        {ro.remote.save}
      </button>
    </form>
  );
}
