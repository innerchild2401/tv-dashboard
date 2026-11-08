"use client";

import { useState } from "react";
import { ro, VIEW_IDS, type ViewId } from "@/i18n/ro";
import { formatClock, formatLongDate } from "@/lib/time/bucharest";
import { useRemote } from "@/components/remote/provider";

export function Detail({ view }: { view: string }) {
  const { board } = useRemote();
  if (!VIEW_IDS.includes(view as ViewId)) {
    return (
      <section className="stack">
        <h1>{ro.remote.notFound}</h1>
        <a href="/remote">{ro.remote.back}</a>
      </section>
    );
  }
  const id = view as ViewId;
  return (
    <section className="stack">
      <a href="/remote">{ro.remote.back}</a>
      <h1>{ro.views[id]}</h1>
      {id === "today" || id === "week" ? <Agenda people={board.config.people} events={board.events} /> : null}
      {id === "momente" ? <MomenteList spotlights={board.spotlights} /> : null}
      {id === "site" ? <MetricList metrics={board.metrics} prefix="site." title={ro.remote.pages} /> : null}
      {id === "tiktok" ? <MetricList metrics={board.metrics} prefix="tiktok." title={ro.remote.videos} /> : null}
      {id === "vision" ? (
        <>
          <a href="/remote/cards">{ro.remote.openCards}</a>
          <ul className="plain-list">
            {board.cards.map((card) => (
              <li key={card.id}>
                {ro.remote.kinds[card.kind]} · {card.title || card.body || card.color}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {id === "home" ? (
        <>
          <a href="/remote/lists">{ro.remote.openLists}</a>
          <h2>{ro.tasks}</h2>
          <ul>
            {board.tasks.map((task) => (
              <li key={task.id} className={task.done ? "done" : undefined}>
                {task.text}
              </li>
            ))}
          </ul>
          <h2>{ro.shopping}</h2>
          <ul>
            {board.shopping.map((item) => (
              <li key={item.id} className={item.checked ? "done" : undefined}>
                {item.text}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Agenda({
  people,
  events,
}: {
  people: { id: string; name: string; color: string }[];
  events: { id: string; title: string; start: string; end: string; allDay: boolean; personId: string | null }[];
}) {
  const [person, setPerson] = useState("all");
  const shown = events.filter((event) => person === "all" || event.personId === person);
  const groups = new Map<string, typeof shown>();
  for (const event of shown) {
    const key = formatLongDate(new Date(event.start));
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  return (
    <div className="stack">
      <div className="chips">
        <button type="button" aria-pressed={person === "all"} onClick={() => setPerson("all")}>
          {ro.remote.filterAll}
        </button>
        {people.map((item) => (
          <button key={item.id} type="button" aria-pressed={person === item.id} onClick={() => setPerson(item.id)}>
            <span className="dot" style={{ background: item.color }} />
            {item.name}
          </button>
        ))}
      </div>
      {[...groups.entries()].map(([day, items]) => (
        <section key={day}>
          <h2>{day}</h2>
          <ul className="plain-list">
            {items.map((event) => (
              <li key={event.id}>
                {event.allDay ? ro.allDay : `${formatClock(new Date(event.start))}–${formatClock(new Date(event.end))}`} · {event.title}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MomenteList({
  spotlights,
}: {
  spotlights: { id: string; title: string; kind: string; startsAt: string; note: string | null; pinned: boolean }[];
}) {
  if (spotlights.length === 0) {
    return <p>{ro.momenteEmpty}</p>;
  }
  return (
    <ul className="plain-list">
      {spotlights.map((item) => (
        <li key={item.id}>
          {ro.spotlightKinds[item.kind as keyof typeof ro.spotlightKinds] ?? item.kind} · {item.title}
          {item.note ? ` — ${item.note}` : ""}
        </li>
      ))}
    </ul>
  );
}

function MetricList({
  metrics,
  prefix,
  title,
}: {
  metrics: { key: string; value: number; previous: number | null }[];
  prefix: string;
  title: string;
}) {
  const rows = metrics.filter((metric) => metric.key.startsWith(prefix));
  return (
    <div>
      <h2>{title}</h2>
      <ul className="plain-list">
        {rows.map((metric) => (
          <li key={metric.key}>
            <span>{metric.key.slice(prefix.length)}</span>
            <strong>{new Intl.NumberFormat("ro-RO").format(metric.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
