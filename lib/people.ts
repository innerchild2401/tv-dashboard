export type PersonChip = { name: string; color: string };

export function personChip(
  people: { id: string; name: string; color: string }[],
  personId: string | null,
): PersonChip | null {
  if (!personId) return null;
  const person = people.find((item) => item.id === personId);
  if (!person) return null;
  return { name: person.name, color: person.color };
}
