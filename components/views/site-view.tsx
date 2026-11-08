import { ro } from "@/i18n/ro";
import type { SiteModel } from "@/lib/state/types";

export function SiteView({ view }: { view: SiteModel }) {
  return (
    <section className={view.celebration ? "site has-celebration" : "site"} aria-label={ro.views.site}>
      {view.celebration ? <Celebration text={view.celebration} /> : null}
      <div className="stat-row">
        {view.stats.map((stat) => (
          <article key={stat.label} className="stat">
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            {stat.delta ? <span>{stat.delta}</span> : <span className="delta-spacer" />}
          </article>
        ))}
      </div>
      <figure className="chart-card">
        <figcaption>
          {ro.chartSite}
          {view.updatedLabel ? <span>{view.updatedLabel}</span> : null}
        </figcaption>
        <AreaChart values={view.series} label={ro.chartSite} />
      </figure>
      <div className="split">
        <Ranked title={ro.topPages} rows={view.pages} />
        <Ranked title={ro.sources} rows={view.sources} />
      </div>
    </section>
  );
}

function Celebration({ text }: { text: string }) {
  return (
    <article className="celebrate">
      <p className="kicker">{ro.remote.ruleCelebration}</p>
      <h2>{text}</h2>
    </article>
  );
}

function Ranked({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <section className="rank">
      <h2>{title}</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AreaChart({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const width = 640;
  const height = 150;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 8 - (value / max) * (height - 20);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join(" L")}`;
  const fill = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label={label} preserveAspectRatio="none">
      <path d={fill} className="chart-fill" />
      <path d={line} className="chart-line" />
    </svg>
  );
}
