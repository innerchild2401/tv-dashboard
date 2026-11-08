import { ro } from "@/i18n/ro";
import type { HomeModel } from "@/lib/state/types";
import { Person } from "@/components/tv/person";

export function HomeView({ view }: { view: HomeModel }) {
  return (
    <section className="home-board" aria-label={ro.views.home}>
      <div>
        <h2>{ro.tasks}</h2>
        {view.inboxWaiting > 0 ? (
          <p className="inbox-note">
            {view.inboxWaiting} {ro.inboxWaiting}
          </p>
        ) : null}
        {view.tasks.length === 0 ? <p className="empty">{ro.noTasks}</p> : null}
        <ul className="check-list">
          {view.tasks.map((task) => (
            <li key={task.id} className={task.done ? "done" : undefined}>
              <span className="mark" aria-hidden="true">
                {task.done ? "✓" : ""}
              </span>
              <p>{task.text}</p>
              <span className="meta">
                {task.due ? <time>{task.due}</time> : null}
                {task.person ? <Person person={task.person} /> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2>{ro.shopping}</h2>
        {view.groups.length === 0 ? <p className="empty">{ro.emptyShopping}</p> : null}
        {view.groups.map((group) => (
          <section key={group.category}>
            <h3>{group.category}</h3>
            <ul className="check-list">
              {group.items.map((item) => (
                <li key={item.id} className={item.checked ? "done" : undefined}>
                  <span className="mark" aria-hidden="true">
                    {item.checked ? "✓" : ""}
                  </span>
                  <p>{item.text}</p>
                  {item.qty ? <span className="qty">{item.qty}</span> : <span />}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
