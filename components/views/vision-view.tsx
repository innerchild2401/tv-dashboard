import { ro } from "@/i18n/ro";
import type { VisionCardModel, VisionModel } from "@/lib/state/types";

export function VisionView({ view }: { view: VisionModel }) {
  return (
    <section className="vision" aria-label={ro.views.vision}>
      {view.cards.map((card) => (
        <article
          key={card.id}
          className={`vision-card ${card.color} ${card.kind}`}
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

function CardBody({ card }: { card: VisionCardModel }) {
  if (card.kind === "affirmation") {
    return <p className="script">{card.body}</p>;
  }
  if (card.kind === "word") {
    return (
      <>
        <p className="card-kicker">{card.title ?? ro.wordOfMonth}</p>
        <h2>{card.word}</h2>
      </>
    );
  }
  if (card.kind === "countdown" && card.countdownValue) {
    return (
      <>
        <p className="card-kicker">
          <span aria-hidden="true">✦ </span>
          {card.title}
        </p>
        <h2 className="hero-num">{card.countdownValue}</h2>
        <p>{card.countdownUnit}</p>
      </>
    );
  }
  if (card.kind === "progress" && card.progress) {
    return (
      <>
        <p className="card-kicker">{card.progress.label}</p>
        {card.progress.style === "bar" ? <Bar value={card.progress.value} max={card.progress.max} /> : <Ring value={card.progress.value} max={card.progress.max} />}
        <strong>{card.progress.text}</strong>
      </>
    );
  }
  if (card.kind === "wins") {
    return (
      <>
        <p className="card-kicker">{ro.wins}</p>
        <ul>
          {card.wins.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </>
    );
  }
  if (card.kind === "recap") {
    return (
      <>
        <p className="card-kicker">{ro.views.today}</p>
        <p className="recap-text">{card.body}</p>
      </>
    );
  }
  return (
    <>
      {card.title ? <p className="card-kicker">{card.title}</p> : <p className="card-kicker">{ro.photo}</p>}
      {card.body ? <p>{card.body}</p> : null}
    </>
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
