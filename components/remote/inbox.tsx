"use client";

import { useState } from "react";
import { ro } from "@/i18n/ro";
import type { Destination } from "@/lib/remote/capture";
import { formatClock } from "@/lib/time/bucharest";
import { useRemote } from "@/components/remote/provider";

const DESTINATIONS: Destination[] = ["auto", "task", "shopping", "idea"];

export function Inbox() {
  const { board, send } = useRemote();
  const [destination, setDestination] = useState<Destination>("auto");
  return (
    <section className="stack">
      <h1>{ro.remote.inbox}</h1>
      <p>{ro.remote.shareHint}</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const text = String(new FormData(form).get("text") ?? "");
          void send("/api/remote/inbox", { text, destination }).then((ok) => {
            if (ok) form.reset();
          });
        }}
      >
        <label>
          {ro.remote.capture}
          <textarea name="text" required maxLength={500} rows={3} />
        </label>
        <div className="chips">
          {DESTINATIONS.map((item) => (
            <button key={item} type="button" aria-pressed={destination === item} onClick={() => setDestination(item)}>
              {label(item)}
            </button>
          ))}
        </div>
        <button type="submit">{ro.remote.save}</button>
      </form>
      <ul className="plain-list">
        {board.inbox.map((item) => (
          <li key={item.id}>
            <div>
              <p>{item.text}</p>
              <p className="meta">
                {statusLabel(item.status)}
                {item.routedTo ? ` · ${routeLabel(item.routedTo.type)}` : ""} · {formatClock(new Date(item.receivedAt))}
              </p>
            </div>
            <button type="button" onClick={() => void send(`/api/remote/inbox/${item.id}`, undefined, "DELETE")}>
              {ro.remote.delete}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function label(destination: Destination): string {
  if (destination === "auto") return ro.remote.auto;
  if (destination === "task") return ro.tasks;
  if (destination === "shopping") return ro.shopping;
  return ro.remote.idea;
}

function statusLabel(status: string): string {
  if (status === "routed") return ro.remote.routed;
  if (status === "needs_review") return ro.remote.review;
  return ro.remote.waiting;
}

function routeLabel(type: string): string {
  if (type === "task") return ro.tasks;
  if (type === "shopping") return ro.shopping;
  if (type === "idea") return ro.remote.idea;
  if (type === "event") return ro.views.today;
  return ro.remote.kinds.note;
}
