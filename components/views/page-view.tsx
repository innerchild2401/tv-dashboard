import { ro } from "@/i18n/ro";
import type { CustomPageModel } from "@/lib/state/types";

export function PageView({ view }: { view: CustomPageModel }) {
  return (
    <section className="custom-page" aria-label={view.title}>
      <h1>{view.title}</h1>
      {view.body.trim() ? <p>{view.body}</p> : <p className="custom-page-empty">{ro.customPageEmpty}</p>}
    </section>
  );
}
