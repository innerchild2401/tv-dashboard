import { ro } from "@/i18n/ro";
import type { WeekModel } from "@/lib/state/types";
import { Person } from "@/components/tv/person";

export function WeekView({ view }: { view: WeekModel }) {
  return (
    <section className="week" aria-label={ro.views.week}>
      {view.columns.map((column) => (
        <article key={column.key} className={column.isToday ? "week-col today" : "week-col"}>
          <header>
            <p>{column.weekday}</p>
            <strong>{column.day}</strong>
          </header>
          {column.events.length === 0 ? (
            <p className="empty">{ro.nothingShort}</p>
          ) : (
            <ul>
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
    </section>
  );
}
