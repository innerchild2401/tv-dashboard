import { ro } from "@/i18n/ro";
import type { VisionCardModel, VisionModel } from "@/lib/state/types";

export function VisionView({ view }: { view: VisionModel }) {
  return (
    <section className="vision" aria-label={ro.views.vision}>
      {view.cards.map((card) => (
        <article
          key={card.id}
          className={`vision-card ${card.color} ${card.kind} font-${card.fontScale}${card.photoUrl ? " has-photo" : ""}${spanClass(card)}`}
          style={{
            gridColumn: `${card.col + 1} / span ${card.colSpan}`,
            gridRow: `${card.row + 1} / span ${card.rowSpan}`,
            transform: `rotate(${card.tilt}deg)`,
          }}
        >
          <CardBody card={card} />
        </article>
      ))}
    </section>
  );
}

function spanClass(card: VisionCardModel): string {
  if (card.colSpan >= 2 && card.rowSpan >= 2) return " span-lg";
  if (card.colSpan >= 2 || card.rowSpan >= 2) return " span-md";
  return " span-sm";
}

function CardBody({ card }: { card: VisionCardModel }) {
  if (card.kind === "photo" && card.photoUrl) {
    const caption = card.title ?? card.body ?? ro.photo;
    return (
      <div className="photo-frame">
        <span className="photo-tape" aria-hidden="true" />
        <div className="photo-mat">
          <img src={card.photoUrl} alt={caption} />
        </div>
        <p className="photo-caption">{caption}</p>
      </div>
    );
  }

  if (card.kind === "affirmation") {
    return (
      <div className="card-fill">
        <p className="card-kicker">{card.title ?? ro.views.vision}</p>
        <p className="script card-body">{card.body}</p>
      </div>
    );
  }

  if (card.kind === "word") {
    return (
      <div className="card-fill">
        <p className="card-kicker">{card.title ?? ro.wordOfMonth}</p>
        <h2 className="card-hero">{card.word}</h2>
        {card.body && card.body !== card.word ? <p className="card-body">{card.body}</p> : null}
      </div>
    );
  }

  if (card.kind === "countdown" && card.countdownValue) {
    return (
      <div className="card-fill">
        <p className="card-kicker">
          <span aria-hidden="true">✦ </span>
          {card.title ?? ro.views.momente}
        </p>
        <h2 className="hero-num card-hero">{card.countdownValue}</h2>
        <p className="card-unit">{card.countdownUnit}</p>
        {card.body ? <p className="card-body">{card.body}</p> : null}
      </div>
    );
  }

  if (card.kind === "progress" && card.progress) {
    return (
      <div className="card-fill">
        <p className="card-kicker">{card.title ?? card.progress.label}</p>
        {card.progress.style === "bar" ? <Bar value={card.progress.value} max={card.progress.max} /> : <Ring value={card.progress.value} max={card.progress.max} />}
        <strong className="card-hero">{card.progress.text}</strong>
        {card.body ? <p className="card-body">{card.body}</p> : null}
      </div>
    );
  }

  if (card.kind === "wins") {
    return (
      <div className="card-fill">
        <p className="card-kicker">{ro.wins}</p>
        {card.title ? <h2 className="card-hero wins-title">{card.title}</h2> : null}
        {card.wins.length > 0 ? (
          <ul className="card-body">
            {card.wins.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : card.body ? (
          <p className="card-body">{card.body}</p>
        ) : null}
      </div>
    );
  }

  if (card.kind === "recap") {
    return (
      <div className="card-fill">
        <p className="card-kicker">{card.title ?? ro.views.today}</p>
        <p className="recap-text card-body">{card.body}</p>
      </div>
    );
  }

  return (
    <div className="card-fill">
      <p className="card-kicker">{card.title ?? ro.photo}</p>
      {card.body ? <p className="card-body">{card.body}</p> : null}
    </div>
  );
}

function Ring({ value, max }: { value: number; max: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const portion = Math.max(0, Math.min(1, value / max));
  const dash = circumference * portion;
  return (
    <svg viewBox="0 0 72 72" className="ring" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} className="ring-track" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        className="ring-value"
        strokeDasharray={`${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}`}
      />
    </svg>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const portion = Math.max(0, Math.min(1, value / max));
  return (
    <span className="bar-track" aria-hidden="true">
      <span style={{ width: `${portion * 100}%` }} />
    </span>
  );
}
