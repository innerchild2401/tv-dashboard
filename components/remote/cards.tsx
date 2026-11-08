"use client";

import { useState } from "react";
import { ro } from "@/i18n/ro";
import { emptyCardData } from "@/lib/remote/cards";
import { fromLocalInput, toLocalInput } from "@/lib/remote/local-time";
import type { EditableCard, Palette } from "@/lib/remote/types";
import { useRemote } from "@/components/remote/provider";

const COLORS: Palette[] = ["sand", "coral", "lilac", "mint", "sky", "pink"];
const KINDS = ["photo", "affirmation", "countdown", "word", "progress", "wins", "recap", "note"] as const;

export function CardsEditor() {
  const { board, send, upload } = useRemote();
  const [selected, setSelected] = useState<string | null>(board.cards[0]?.id ?? null);
  const [draft, setDraft] = useState<EditableCard | null>(null);
  const card = draft ?? board.cards.find((item) => item.id === selected) ?? null;

  function choose(next: EditableCard) {
    setSelected(next.id);
    setDraft(null);
  }

  async function save(next: EditableCard, unlock = false) {
    const body = {
      ...next,
      expiresAt: next.expiresAt,
      unlock,
    };
    const ok = await send(`/api/remote/cards/${next.id}`, body, "PATCH");
    if (ok) setDraft(null);
  }

  return (
    <section className="stack">
      <h1>{ro.remote.cards}</h1>
      <p>{ro.remote.dragHint}</p>
      <div
        className="mini-grid"
        onPointerUp={(event) => {
          if (!card || !draft) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const col = Math.max(0, Math.min(4 - card.grid.colSpan, Math.floor(((event.clientX - bounds.left) / bounds.width) * 4)));
          const row = Math.max(0, Math.min(3 - card.grid.rowSpan, Math.floor(((event.clientY - bounds.top) / bounds.height) * 3)));
          if (col === card.grid.col && row === card.grid.row) return;
          const next = { ...card, grid: { ...card.grid, col, row } };
          setDraft(next);
          void save(next);
        }}
      >
        {board.cards.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mini-card ${item.color}${item.id === card?.id ? " selected" : ""}`}
            style={{
              gridColumn: `${item.grid.col + 1} / span ${item.grid.colSpan}`,
              gridRow: `${item.grid.row + 1} / span ${item.grid.rowSpan}`,
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              choose(item);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!bounds) return;
              const col = Math.max(0, Math.min(4 - item.grid.colSpan, Math.floor(((event.clientX - bounds.left) / bounds.width) * 4)));
              const row = Math.max(0, Math.min(3 - item.grid.rowSpan, Math.floor(((event.clientY - bounds.top) / bounds.height) * 3)));
              if (col === item.grid.col && row === item.grid.row) return;
              const next = { ...item, grid: { ...item.grid, col, row } };
              setDraft(next);
              void save(next);
            }}
          >
            {item.title || item.body || ro.remote.kinds[item.kind]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const grid = freeCell(board.cards);
          void send("/api/remote/cards", {
            kind: "note",
            title: ro.remote.kinds.note,
            body: "",
            color: "sand",
            tilt: 0,
            grid,
            pinned: false,
            data: { text: "" },
          });
        }}
      >
        {ro.remote.addCard}
      </button>
      {card ? (
        <CardForm
          card={card}
          onChange={setDraft}
          onSave={() => void save(card)}
          onDelete={() => void send(`/api/remote/cards/${card.id}`, undefined, "DELETE")}
          onUnlock={() => void save(card, true)}
          onPhoto={async (file) => {
            const path = await upload(file);
            if (!path) return;
            const next = { ...card, kind: "photo" as const, data: { ...card.data, storagePath: path } };
            setDraft(next);
            await save(next);
          }}
        />
      ) : null}
    </section>
  );
}

function CardForm({
  card,
  onChange,
  onSave,
  onDelete,
  onUnlock,
  onPhoto,
}: {
  card: EditableCard;
  onChange: (card: EditableCard) => void;
  onSave: () => void;
  onDelete: () => void;
  onUnlock: () => void;
  onPhoto: (file: File) => void;
}) {
  const data = card.data;
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label>
        {ro.remote.kind}
        <select
          value={card.kind}
          onChange={(event) => {
            const kind = event.target.value as EditableCard["kind"];
            onChange({ ...card, kind, data: emptyCardData(kind, new Date()) });
          }}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ro.remote.kinds[kind]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {ro.remote.title}
        <input value={card.title ?? ""} onChange={(event) => onChange({ ...card, title: event.target.value })} />
      </label>
      <label>
        {ro.remote.body}
        <textarea value={card.body ?? ""} onChange={(event) => onChange({ ...card, body: event.target.value })} />
      </label>
      <div className="swatches">
        {COLORS.map((color) => (
          <button key={color} type="button" className={`swatch ${color}${card.color === color ? " selected" : ""}`} aria-pressed={card.color === color} onClick={() => onChange({ ...card, color })} />
        ))}
      </div>
      <label>
        {ro.remote.tilt}
        <input type="range" min={-3} max={3} step={0.5} value={card.tilt} onChange={(event) => onChange({ ...card, tilt: Number(event.target.value) })} />
      </label>
      <div className="pair">
        {(["col", "row", "colSpan", "rowSpan"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              type="number"
              min={0}
              max={key.endsWith("Span") ? 4 : 3}
              value={card.grid[key]}
              onChange={(event) => onChange({ ...card, grid: { ...card.grid, [key]: Number(event.target.value) } })}
            />
          </label>
        ))}
      </div>
      <label>
        {ro.remote.expires}
        <input
          type="datetime-local"
          value={toLocalInput(card.expiresAt)}
          onChange={(event) => onChange({ ...card, expiresAt: event.target.value ? fromLocalInput(event.target.value) : null })}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={card.pinned} onChange={(event) => onChange({ ...card, pinned: event.target.checked })} />
        {ro.remote.pinned}
      </label>
      {card.kind === "photo" ? (
        <>
          {card.photoUrl ? <img className="preview-photo" src={card.photoUrl} alt={card.title ?? ro.photo} /> : null}
          <label>
            {ro.remote.camera}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPhoto(file);
              }}
            />
          </label>
          <label>
            {ro.remote.gallery}
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPhoto(file);
              }}
            />
          </label>
          <label>
            {ro.remote.photoAlt}
            <input value={stringField(data, "alt")} onChange={(event) => onChange({ ...card, data: { ...data, alt: event.target.value } })} />
          </label>
        </>
      ) : null}
      {card.kind === "word" ? (
        <label>
          {ro.remote.word}
          <input value={stringField(data, "word")} onChange={(event) => onChange({ ...card, data: { ...data, word: event.target.value } })} />
        </label>
      ) : null}
      {card.kind === "affirmation" || card.kind === "note" ? (
        <label>
          {ro.remote.body}
          <textarea value={stringField(data, "text")} onChange={(event) => onChange({ ...card, data: { ...data, text: event.target.value } })} />
        </label>
      ) : null}
      {card.kind === "countdown" ? (
        <>
          <label>
            {ro.remote.label}
            <input value={stringField(data, "label")} onChange={(event) => onChange({ ...card, data: { ...data, label: event.target.value } })} />
          </label>
          <label>
            {ro.remote.target}
            <input
              type="datetime-local"
              value={toLocalInput(stringField(data, "target"))}
              onChange={(event) => onChange({ ...card, data: { ...data, target: fromLocalInput(event.target.value) ?? stringField(data, "target") } })}
            />
          </label>
        </>
      ) : null}
      {card.kind === "progress" ? (
        <>
          <label>
            {ro.remote.label}
            <input value={stringField(data, "label")} onChange={(event) => onChange({ ...card, data: { ...data, label: event.target.value } })} />
          </label>
          <div className="pair">
            <label>
              {ro.remote.value}
              <input type="number" value={numberField(data, "value")} onChange={(event) => onChange({ ...card, data: { ...data, value: Number(event.target.value) } })} />
            </label>
            <label>
              {ro.remote.max}
              <input type="number" min={1} value={numberField(data, "max")} onChange={(event) => onChange({ ...card, data: { ...data, max: Number(event.target.value) } })} />
            </label>
          </div>
          <label>
            {ro.remote.style}
            <select value={stringField(data, "style") || "ring"} onChange={(event) => onChange({ ...card, data: { ...data, style: event.target.value } })}>
              <option value="ring">{ro.remote.ring}</option>
              <option value="bar">{ro.remote.bar}</option>
            </select>
          </label>
          <label>
            {ro.remote.evidence}
            <input value={stringField(data, "evidence")} onChange={(event) => onChange({ ...card, data: { ...data, evidence: event.target.value } })} />
          </label>
        </>
      ) : null}
      {card.kind === "wins" ? <WinsEditor card={card} onChange={onChange} /> : null}
      <p>
        {card.locked ? ro.lockedView : ro.remote.resetAssistant} · {card.source}
      </p>
      <div className="pair">
        <button type="submit">{ro.remote.save}</button>
        <button type="button" onClick={onDelete}>
          {ro.remote.delete}
        </button>
      </div>
      {card.locked ? (
        <button type="button" onClick={onUnlock}>
          {ro.remote.resetAssistant}
        </button>
      ) : null}
    </form>
  );
}

function WinsEditor({ card, onChange }: { card: EditableCard; onChange: (card: EditableCard) => void }) {
  const items = Array.isArray(card.data.items) ? card.data.items : [];
  return (
    <div className="stack">
      {items.map((item, index) => {
        const record = item && typeof item === "object" ? (item as { text?: string; evidence?: string }) : {};
        return (
          <article key={index} className="card-row">
            <label>
              {ro.remote.body}
              <input
                value={record.text ?? ""}
                onChange={(event) => {
                  const next = items.map((entry, entryIndex) => (entryIndex === index ? { ...record, text: event.target.value } : entry));
                  onChange({ ...card, data: { ...card.data, items: next } });
                }}
              />
            </label>
            <label>
              {ro.remote.evidence}
              <input
                value={record.evidence ?? ""}
                onChange={(event) => {
                  const next = items.map((entry, entryIndex) => (entryIndex === index ? { ...record, evidence: event.target.value } : entry));
                  onChange({ ...card, data: { ...card.data, items: next } });
                }}
              />
            </label>
          </article>
        );
      })}
      <button
        type="button"
        onClick={() => onChange({ ...card, data: { ...card.data, items: [...items, { text: "", evidence: "manual:phone" }] } })}
      >
        {ro.remote.addWin}
      </button>
    </div>
  );
}

function freeCell(cards: EditableCard[]) {
  const taken = new Set(cards.map((card) => `${card.grid.col}:${card.grid.row}`));
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if (!taken.has(`${col}:${row}`)) return { col, row, colSpan: 1, rowSpan: 1 };
    }
  }
  return { col: 0, row: 0, colSpan: 1, rowSpan: 1 };
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === "number" ? value : 0;
}
