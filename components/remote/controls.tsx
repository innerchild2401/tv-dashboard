"use client";

import { ro } from "@/i18n/ro";
import { fromLocalInput } from "@/lib/remote/local-time";
import { dateKey, endOfZonedDay, zonedParts } from "@/lib/time/bucharest";
import { useRemote } from "@/components/remote/provider";

export function Controls() {
  const { board, send } = useRemote();
  const paused = board.hold === "paused";
  const locked = board.hold === "locked";

  return (
    <section className="stack">
      <p className="kicker">{ro.remote.now}</p>
      <h1>{ro.views[board.viewId]}</h1>
      <p>
        {ro.remote.why}: {board.reason}
      </p>
      {board.notices.length > 0 ? (
        <ul className="rule-list">
          {board.notices.map((notice) => (
            <li key={`${notice.id}-${notice.reason}`}>{notice.reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="pair">
        <button type="button" onClick={() => void send("/api/remote/control", { type: "previous" })}>
          {ro.remote.previous}
        </button>
        <button type="button" onClick={() => void send("/api/remote/control", { type: "next" })}>
          {ro.remote.next}
        </button>
      </div>
      <div className="pair">
        <button type="button" onClick={() => void send("/api/remote/control", { type: paused ? "resume" : "pause" })}>
          {paused ? ro.remote.resume : ro.remote.pause}
        </button>
        <button type="button" onClick={() => void send("/api/remote/control", { type: locked ? "unlock" : "lock", viewId: board.viewId })}>
          {locked ? ro.remote.release : ro.remote.lock}
        </button>
      </div>
      <form
        className="pair"
        onSubmit={(event) => {
          event.preventDefault();
          const minutes = Number(new FormData(event.currentTarget).get("minutes"));
          void send("/api/remote/control", { type: "pin", viewId: board.viewId, minutes });
        }}
      >
        <label>
          {ro.remote.minutes}
          <input name="minutes" type="number" min={1} max={180} defaultValue={10} inputMode="numeric" />
        </label>
        <button type="submit">{ro.remote.pin}</button>
      </form>
      <button type="button" onClick={() => void send("/api/remote/control", { type: board.dimmed ? "undim" : "dim" })}>
        {board.dimmed ? ro.remote.bright : ro.remote.dim}
      </button>
      <a className="text-link" href={`/remote/detail/${board.viewId}`}>
        {ro.remote.detail}
      </a>
      <PriorityForm />
    </section>
  );
}

function PriorityForm() {
  const { board, send } = useRemote();
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const due = String(data.get("due") ?? "");
        const now = new Date();
        const today = dateKey(zonedParts(now));
        void send("/api/remote/priority", {
          text: String(data.get("text") ?? ""),
          reason: String(data.get("reason") ?? ""),
          dueAt: due ? fromLocalInput(`${today}T${due}`) : null,
          expiresAt: endOfZonedDay(zonedParts(now)).toISOString(),
        });
      }}
    >
      <h2>{ro.priority}</h2>
      {board.priority ? (
        <p>
          {board.priority.text} — {board.priority.reason}
        </p>
      ) : null}
      <label>
        {ro.remote.priorityText}
        <input name="text" required maxLength={200} defaultValue={board.priority?.text ?? ""} />
      </label>
      <label>
        {ro.remote.priorityReason}
        <input name="reason" required maxLength={300} defaultValue={board.priority?.reason ?? ""} />
      </label>
      <label>
        {ro.remote.priorityDue}
        <input name="due" type="time" />
      </label>
      <div className="pair">
        <button type="submit">{ro.remote.save}</button>
        <button type="button" onClick={() => void send("/api/remote/priority", undefined, "DELETE")}>
          {ro.remote.clear}
        </button>
      </div>
    </form>
  );
}
