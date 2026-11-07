import type { MonthModel } from "@/lib/state/types";

export function MonthView({ view }: { view: MonthModel }) {
  return (
    <section className="month" aria-label={view.title}>
      <h2>{view.title}</h2>
      <div className="month-grid">
        {view.weekdays.map((label) => (
          <p key={label} className="month-weekday">
            {label}
          </p>
        ))}
        {view.cells.map((cell) => (
          <article key={cell.key} className={cellClass(cell)}>
            <header>
              <strong>{cell.day}</strong>
              {cell.extra > 0 ? (
                <span className="month-more">
                  <span className="dots" aria-hidden="true">
                    {Array.from({ length: Math.min(cell.extra, 3) }, (_, index) => (
                      <i key={index} />
                    ))}
                  </span>
                  +{cell.extra}
                </span>
              ) : null}
            </header>
            {cell.title ? <p>{cell.title}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function cellClass(cell: MonthModel["cells"][number]): string {
  const names = ["month-cell"];
  if (!cell.inMonth) names.push("dim");
  if (cell.isToday) names.push("today");
  return names.join(" ");
}
