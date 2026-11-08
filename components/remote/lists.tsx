"use client";

import { ro } from "@/i18n/ro";
import { useRemote } from "@/components/remote/provider";

export function Lists() {
  const { board, send } = useRemote();
  return (
    <section className="stack">
      <h1>{ro.remote.lists}</h1>
      <h2>{ro.tasks}</h2>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const assignee = String(data.get("assignee") ?? "");
          void send("/api/remote/tasks", {
            text: String(data.get("text") ?? ""),
            assigneeId: assignee || null,
            dueDate: String(data.get("due") ?? "") || null,
          });
          event.currentTarget.reset();
        }}
      >
        <label>
          {ro.remote.addTask}
          <input name="text" required maxLength={500} enterKeyHint="send" />
        </label>
        <div className="pair">
          <label>
            {ro.remote.assignee}
            <select name="assignee" defaultValue="">
              <option value="">{ro.remote.none}</option>
              {board.config.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ro.remote.due}
            <input name="due" type="date" />
          </label>
        </div>
        <button type="submit">{ro.remote.save}</button>
      </form>
      <ul className="plain-list">
        {board.tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className="check"
              aria-pressed={task.done}
              onClick={() =>
                void send(`/api/remote/tasks/${task.id}`, { done: !task.done }, "PATCH", (current) => ({
                  ...current,
                  tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item)),
                }))
              }
            >
              {task.done ? "✓" : ""}
            </button>
            <span className={task.done ? "done" : undefined}>{task.text}</span>
            <button type="button" onClick={() => void send(`/api/remote/tasks/${task.id}`, undefined, "DELETE")}>
              {ro.remote.delete}
            </button>
          </li>
        ))}
      </ul>

      <h2>{ro.shopping}</h2>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void send("/api/remote/shopping", {
            text: String(data.get("text") ?? ""),
            qty: Number(data.get("qty") ?? 1),
            unit: String(data.get("unit") ?? ""),
            category: String(data.get("category") ?? ""),
          });
          event.currentTarget.reset();
        }}
      >
        <label>
          {ro.remote.addShopping}
          <input name="text" required maxLength={200} enterKeyHint="send" />
        </label>
        <div className="pair">
          <label>
            {ro.remote.qty}
            <input name="qty" type="number" min={0} step="0.5" defaultValue={1} />
          </label>
          <label>
            {ro.remote.unit}
            <input name="unit" maxLength={40} />
          </label>
        </div>
        <label>
          {ro.remote.category}
          <input name="category" maxLength={80} list="categories" />
        </label>
        <datalist id="categories">
          {[...new Set(board.shopping.map((item) => item.category).filter(Boolean))].map((category) => (
            <option key={category} value={category ?? ""} />
          ))}
        </datalist>
        <button type="submit">{ro.remote.save}</button>
      </form>
      <ul className="plain-list">
        {board.shopping.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="check"
              aria-pressed={item.checked}
              onClick={() =>
                void send(`/api/remote/shopping/${item.id}`, { checked: !item.checked }, "PATCH", (current) => ({
                  ...current,
                  shopping: current.shopping.map((row) => (row.id === item.id ? { ...row, checked: !row.checked } : row)),
                }))
              }
            >
              {item.checked ? "✓" : ""}
            </button>
            <span className={item.checked ? "done" : undefined}>
              {item.text}
              {item.qty !== 1 || item.unit ? ` · ${item.qty}${item.unit ? ` ${item.unit}` : ""}` : ""}
              {item.category ? ` · ${item.category}` : ""}
            </span>
            <button type="button" onClick={() => void send(`/api/remote/shopping/${item.id}`, undefined, "DELETE")}>
              {ro.remote.delete}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
