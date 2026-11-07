"use client";

import { ro } from "@/i18n/ro";
import { projectToday, type AgendaItem, type PersonChip, type TodayView } from "@/lib/today/project";
import { sampleSchedule } from "@/lib/today/schedule";
import { useEffect, useState } from "react";

export function TodayScreen({ initial }: { initial: TodayView }) {
  const [view, setView] = useState(initial);

  useEffect(() => {
    const tick = () => setView(projectToday(sampleSchedule, new Date()));
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      document.documentElement.style.setProperty("--tv-scale", scale.toFixed(4));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <main className="tv-frame">
      <div className="tv-slot">
        <div className="tv-stage">
          <div className="tv-canvas">
            <header className="tv-header">
              <div>
                <p className="clock">{view.clock}</p>
                <p className="date-label">{view.dateLabel}</p>
              </div>
              <div className="weather">
                <p className="weather-temp">
                  {view.weather.tempC}
                  <span aria-hidden="true">°</span>
                </p>
                <p className="weather-meta">
                  <span>{view.weather.location}</span>
                  <span>{view.weather.label}</span>
                </p>
              </div>
            </header>

            {view.priority ? (
              <section className="priority" aria-label={ro.priority}>
                <div className="priority-bar" aria-hidden="true" />
                <div>
                  <p className="kicker">{ro.priority}</p>
                  <p className="priority-text">{view.priority.text}</p>
                  <p className="priority-reason">{view.priority.reason}</p>
                </div>
              </section>
            ) : null}

            <div className="tv-main">
              <section className="agenda" aria-label={view.leadLabel}>
                <div className="agenda-head">
                  <h2>{view.leadLabel}</h2>
                  <p className="lead-date">{view.leadDateLabel}</p>
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
                        <span className="day-titles">
                          {day.titles.length === 0 ? ro.nothingShort : day.titles.join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>

            <nav className="pills" aria-label={ro.viewsNav}>
              <ol>
                {view.views.map((item) => (
                  <li
                    key={item.id}
                    className={item.active ? "pill active" : "pill"}
                    aria-current={item.active ? "true" : undefined}
                  >
                    <span>{item.label}</span>
                    {item.active ? <span className="dwell">{item.dwellLabel}</span> : null}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>
      </div>
    </main>
  );
}

function Agenda({ view }: { view: TodayView }) {
  const rows = view.agenda.flatMap((item) => {
    const row = <AgendaRow key={item.id} item={item} />;
    if (view.showNowLine && view.nowBeforeId === item.id) {
      return [<NowLine key="now" />, row];
    }
    return [row];
  });
  if (view.showNowLine && view.nowBeforeId === null) {
    rows.push(<NowLine key="now" />);
  }
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

function Person({ person }: { person: PersonChip }) {
  return (
    <span className="person">
      <span className="person-swatch" style={{ backgroundColor: person.color }} aria-hidden="true" />
      {person.name}
    </span>
  );
}
