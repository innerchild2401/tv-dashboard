import { ro } from "@/i18n/ro";
import type { HomeModel, HomeSticky } from "@/lib/state/types";
import { Person } from "@/components/tv/person";

export function HomeView({ view }: { view: HomeModel }) {
  return (
    <section className={`home-board density-${view.density}`} aria-label={ro.views.home}>
      <header className="home-board-head">
        <h2>{ro.views.home}</h2>
        {view.inboxWaiting > 0 ? (
          <p className="inbox-note">
            {view.inboxWaiting} {ro.inboxWaiting}
          </p>
        ) : null}
      </header>
      {view.emptyLabel ? <p className="empty home-empty">{view.emptyLabel}</p> : null}
      <div className="postit-wall">
        {view.stickies.map((sticky) => (
          <PostIt key={sticky.id} sticky={sticky} />
        ))}
      </div>
    </section>
  );
}

function PostIt({ sticky }: { sticky: HomeSticky }) {
  return (
    <article
      className={`postit ${sticky.color} kind-${sticky.kind}${sticky.done ? " done" : ""}`}
      style={{ transform: `rotate(${sticky.tilt}deg)` }}
    >
      <span className="postit-tape" aria-hidden="true" />
      <p className="postit-kicker">{sticky.kindLabel}</p>
      <p className="postit-text">{sticky.text}</p>
      {sticky.meta || sticky.person ? (
        <div className="postit-meta">
          {sticky.meta ? <span>{sticky.meta}</span> : null}
          {sticky.person ? <Person person={sticky.person} /> : null}
        </div>
      ) : null}
      {sticky.done ? (
        <span className="postit-check" aria-hidden="true">
          ✓
        </span>
      ) : null}
    </article>
  );
}
