import type { PersonChip } from "@/lib/people";

export function Person({ person }: { person: PersonChip }) {
  return (
    <span className="person">
      <span className="person-swatch" style={{ backgroundColor: person.color }} aria-hidden="true" />
      {person.name}
    </span>
  );
}
