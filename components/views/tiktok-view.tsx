import { ro } from "@/i18n/ro";
import type { TikTokModel } from "@/lib/state/types";

export function TikTokView({ view }: { view: TikTokModel }) {
  const values = view.bars.map((bar) => bar.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  return (
    <section className="tiktok" aria-label={ro.views.tiktok}>
      <article className="stat hero-stat">
        <p>{view.followers.label}</p>
        <strong>{view.followers.value}</strong>
        {view.followers.delta ? <span>{view.followers.delta}</span> : null}
      </article>
      <div className="tiktok-side">
        <div className="stat-row compact">
          {[view.views, view.likes].map((stat) => (
            <article key={stat.label} className="stat">
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              {stat.delta ? <span>{stat.delta}</span> : null}
            </article>
          ))}
        </div>
        <figure className="chart-card">
          <figcaption>
            {ro.chartTiktok}
            {view.updatedLabel ? <span>{view.updatedLabel}</span> : null}
          </figcaption>
          <div className="bars" role="img" aria-label={ro.chartTiktok}>
            {view.bars.map((bar) => (
              <div key={bar.label} className="bar">
                <span style={{ height: `${Math.round(28 + ((bar.value - min) / span) * 92)}px` }} />
                <p>{bar.label}</p>
              </div>
            ))}
          </div>
        </figure>
        {view.video ? (
          <article className="video">
            <p className="kicker">{ro.lastVideo}</p>
            <h2>{view.video.title}</h2>
            <p>
              {view.video.views} {ro.viewsLabel.toLocaleLowerCase("ro-RO")} · {view.video.likes}{" "}
              {ro.likes.toLocaleLowerCase("ro-RO")}
            </p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
