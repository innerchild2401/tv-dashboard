import { ro } from "@/i18n/ro";
import type { AgendaItem } from "@/lib/today/project";
import type { TodayModel } from "@/lib/state/types";
import { Person } from "@/components/tv/person";

export function TodayView({ view }: { view: TodayModel }) {
  return (
    <div className="today-layout">
      <section className="agenda" aria-label={view.leadLabel}>
        <div className="agenda-head">
          <h2>{view.leadLabel}</h2>
          <p className="lead-date">{view.leadDateLabel}</p>
          {view.updatedLabel ? <p className="freshness">{view.updatedLabel}</p> : null}
        </div>
        {view.agenda.length === 0 ? (
          <p className="empty">{view.emptyAgenda}</p>
        ) : (
          <ol className="agenda-list">
            <Agenda view={view} />
          </ol>
        )}
      </section>
      <div className="side">
        <section className="hero" aria-label={view.nextEvent?.kicker ?? view.emptyAgenda}>
          {view.nextEvent ? (
            <>
              <div className="hero-top">
                <p className="kicker">{view.nextEvent.kicker}</p>
                {view.nextEvent.person ? <Person person={view.nextEvent.person} /> : null}
              </div>
              <h2>{view.nextEvent.title}</h2>
              <p className="countdown">
                <span className="countdown-prefix">{view.nextEvent.countdownPrefix}</span>
                <strong>{view.nextEvent.countdown}</strong>
              </p>
              <p className="hero-time">{view.nextEvent.timeLabel}</p>
            </>
          ) : (
            <p className="empty">{view.emptyAgenda}</p>
          )}
        </section>
        <section className="days" aria-label={ro.nextDays}>
          <p className="section-label">{ro.nextDays}</p>
          <ul className="day-list">
            {view.nextDays.map((day) => (
              <li className="day-row" key={day.key}>
                <span className="day-label">{day.label}</span>
                <span className="day-titles">{day.titles.length === 0 ? ro.nothingShort : day.titles.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Agenda({ view }: { view: TodayModel }) {
  const rows = view.agenda.flatMap((item) => {
    const row = <AgendaRow key={item.id} item={item} />;
    if (view.showNowLine && view.nowBeforeId === item.id) return [<NowLine key="now" />, row];
    return [row];
  });
  if (view.showNowLine && view.nowBeforeId === null) rows.push(<NowLine key="now" />);
  return rows;
}

function AgendaRow({ item }: { item: AgendaItem }) {
  return (
    <li className={`agenda-row ${item.state}`}>
      <time>{item.timeLabel}</time>
      <p>{item.title}</p>
      {item.person ? <Person person={item.person} /> : <span />}
    </li>
  );
}

function NowLine() {
  return (
    <li className="now-line" aria-hidden="true">
      <span />
      {ro.now}
      <span />
    </li>
  );
}
