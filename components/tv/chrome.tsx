import type { ReactNode } from "react";
import { ro } from "@/i18n/ro";
import type { ChromeModel } from "@/lib/state/types";

export function Chrome({
  chrome,
  dwellLabel,
  holdFixed = false,
  children,
}: {
  chrome: ChromeModel;
  dwellLabel: string;
  holdFixed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="tv-canvas">
      <header className="tv-header">
        <div>
          <p className="clock" data-tv-clock="">
            {chrome.clock}
          </p>
          <p className="date-label">{chrome.dateLabel}</p>
        </div>
        {chrome.weather.tempC ? (
          <div className="weather">
            <p className="weather-temp">
              {chrome.weather.tempC}
              <span aria-hidden="true">°</span>
            </p>
            <p className="weather-meta">
              <span>{chrome.weather.location}</span>
              {chrome.weather.label ? <span>{chrome.weather.label}</span> : null}
              {chrome.weather.updatedLabel ? <span className="freshness">{chrome.weather.updatedLabel}</span> : null}
            </p>
          </div>
        ) : null}
      </header>

      {chrome.alert ? (
        <p className="weather-alert" role="status">
          {chrome.alert}
        </p>
      ) : null}

      {chrome.priority ? (
        <section className="priority" aria-label={ro.priority}>
          <div className="priority-bar" aria-hidden="true" />
          <div>
            <p className="kicker">{ro.priority}</p>
            <p className="priority-text">{chrome.priority.text}</p>
            <p className="priority-reason">{chrome.priority.reason}</p>
          </div>
        </section>
      ) : null}

      <div className="tv-main">{children}</div>

      <nav className="pills" aria-label={ro.viewsNav}>
        <ol>
          {chrome.pills.map((item) => (
            <li key={item.id} className={item.active ? "pill active" : "pill"} aria-current={item.active ? "true" : undefined}>
              <span>{item.label}</span>
              {item.active ? (
                <span className="dwell" data-tv-dwell="" data-tv-hold={holdFixed ? "1" : "0"}>
                  {dwellLabel}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
