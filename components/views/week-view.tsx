"use client";

import { useEffect, useRef } from "react";
import { ro } from "@/i18n/ro";
import type { WeekModel } from "@/lib/state/types";
import { Person } from "@/components/tv/person";

const SCROLL_PX_PER_SEC = 14;
const PAUSE_MS = 1600;

export function WeekView({ view }: { view: WeekModel }) {
  const boardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const columns = Array.from(board.querySelectorAll<HTMLElement>("[data-week-scroll]"));
    if (columns.length === 0) return;

    let frame = 0;
    let last = performance.now();
    let pauseUntil = 0;
    let direction = 1;

    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      if (now < pauseUntil) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      let anyOverflow = false;
      let allAtEnd = true;
      let allAtStart = true;

      for (const column of columns) {
        const max = column.scrollHeight - column.clientHeight;
        if (max <= 2) continue;
        anyOverflow = true;
        const next = column.scrollTop + direction * ((SCROLL_PX_PER_SEC * dt) / 1000);
        column.scrollTop = Math.max(0, Math.min(max, next));
        if (column.scrollTop < max - 1) allAtEnd = false;
        if (column.scrollTop > 1) allAtStart = false;
      }

      if (!anyOverflow) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      if (direction > 0 && allAtEnd) {
        direction = -1;
        pauseUntil = now + PAUSE_MS;
      } else if (direction < 0 && allAtStart) {
        direction = 1;
        pauseUntil = now + PAUSE_MS;
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [view.columns]);

  return (
    <section ref={boardRef} className="week-board" aria-label={ro.views.week}>
      {view.updatedLabel ? <p className="freshness">{view.updatedLabel}</p> : null}
      <div className="week">
        {view.columns.map((column) => (
          <article key={column.key} className={column.isToday ? "week-col today" : "week-col"}>
            <header>
              <p>{column.weekday}</p>
              <strong>{column.day}</strong>
            </header>
            {column.events.length === 0 ? (
              <p className="empty">{ro.nothingShort}</p>
            ) : (
              <ul data-week-scroll="">
                {column.events.map((event) => (
                  <li key={event.id}>
                    <time>{event.timeLabel}</time>
                    <p>{event.title}</p>
                    {event.person ? <Person person={event.person} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
