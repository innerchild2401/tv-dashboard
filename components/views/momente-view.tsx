import { ro } from "@/i18n/ro";
import type { MomenteItem, MomenteModel } from "@/lib/state/types";

export function MomenteView({ view }: { view: MomenteModel }) {
  const countClass = layoutClass(view);
  return (
    <section className={`momente ${countClass}`} data-momente-layout={view.layout} aria-label={view.title}>
      <header className="momente-head">
        <h2>{view.title}</h2>
        {view.hidden > 0 ? (
          <p className="momente-overflow">
            +{view.hidden} {ro.momenteMore}
          </p>
        ) : null}
      </header>
      {view.items.length === 0 ? (
        <p className="momente-empty">{view.emptyLabel}</p>
      ) : (
        <div className="momente-stage">
          {view.items.map((item, index) => (
            <article
              key={item.id}
              className={`momente-spot kind-${item.kind}${item.today ? " is-today" : ""}${item.pinned ? " is-pinned" : ""}`}
              style={{ ["--spot-i" as string]: String(index) }}
              data-kind={item.kind}
            >
              <p className="momente-kind">{item.kindLabel}</p>
              <h3>{item.title}</h3>
              <div className="momente-count" aria-label={countAria(item)}>
                <span className="momente-digits" data-tv-countdown={item.daysLabel}>
                  {item.daysLabel}
                </span>
                {item.unitLabel ? <span className="momente-unit">{item.unitLabel}</span> : null}
              </div>
              {item.dueLabel ? <p className="momente-due">{item.dueLabel}</p> : null}
              {item.note ? <p className="momente-note">{item.note}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function layoutClass(view: MomenteModel): string {
  const count = view.items.length;
  if (count <= 0) return "momente--0";
  if (count === 1) return "momente--1";
  if (count === 2) return "momente--2";
  if (count <= 4) return `momente--${count}`;
  if (count <= 6) return "momente--dense";
  if (count <= 9) return "momente--gallery";
  return "momente--packed";
}

function countAria(item: MomenteItem): string {
  if (item.today) return ro.dueToday;
  return `${item.daysLabel} ${item.unitLabel ?? ""}`.trim();
}
