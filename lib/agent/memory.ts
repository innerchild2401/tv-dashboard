import { sampleConfig } from "@/lib/seed/sample-config";
import { extensionFor, type ImageKind } from "@/lib/photos/sniff";
import { ROTATE_CONTROL, type DisplayControl } from "@/lib/remote/hold";
import {
  active,
  copy,
  type AgentStore,
  type AuditRow,
  type CardRecord,
  type EventRecord,
  type IdeaRecord,
  type InboxRecord,
  type MetricRecord,
  type PersonRow,
  type PriorityRecord,
  type RecapRecord,
  type ShoppingRecord,
  type TaskRecord,
  type ToolResult,
  type UndoBody,
  type ViewRow,
} from "@/lib/agent/model";

type Bag = {
  audits: AuditRow[];
  auditResults: Map<string, ToolResult>;
  cards: CardRecord[];
  events: EventRecord[];
  tasks: TaskRecord[];
  shopping: ShoppingRecord[];
  recaps: RecapRecord[];
  priorities: PriorityRecord[];
  inbox: InboxRecord[];
  ideas: IdeaRecord[];
  metrics: MetricRecord[];
  control: DisplayControl;
};

export class MemoryStore implements AgentStore {
  private readonly bag: Bag = {
    audits: [],
    auditResults: new Map(),
    cards: [],
    events: [],
    tasks: [],
    shopping: [],
    recaps: [],
    priorities: [],
    inbox: [],
    ideas: [],
    metrics: [],
    control: { ...ROTATE_CONTROL },
  };

  async countRecent(now: Date): Promise<number> {
    const cutoff = now.getTime() - 60_000;
    return this.bag.audits.filter((row) => new Date(row.createdAt).getTime() >= cutoff).length;
  }

  async audit(entry: { tool: string; argsHash: string; result: ToolResult; undo: UndoBody | null; now: Date }): Promise<void> {
    const id = crypto.randomUUID();
    this.bag.audits.push({
      id,
      tool: entry.tool,
      undo: entry.undo ? copy(entry.undo) : null,
      undoneAt: null,
      createdAt: entry.now.toISOString(),
    });
    this.bag.auditResults.set(id, copy(entry.result));
  }

  async recentUndoable(): Promise<AuditRow[]> {
    return this.bag.audits
      .filter((row) => row.tool !== "undo" && row.undo)
      .slice(-50)
      .reverse()
      .map((row) => copy(row));
  }

  async markUndone(id: string, now: Date): Promise<void> {
    const row = this.bag.audits.find((item) => item.id === id);
    if (row) row.undoneAt = now.toISOString();
  }

  async applyUndo(body: UndoBody, now: Date): Promise<void> {
    for (const card of body.cards ?? []) this.replace(this.bag.cards, card);
    for (const event of body.events ?? []) this.replace(this.bag.events, event);
    for (const task of body.tasks ?? []) this.replace(this.bag.tasks, task);
    for (const item of body.shopping ?? []) this.replace(this.bag.shopping, item);
    for (const recap of body.recaps ?? []) this.replace(this.bag.recaps, recap);
    for (const priority of body.priorities ?? []) this.replace(this.bag.priorities, priority);
    for (const item of body.inbox ?? []) this.replace(this.bag.inbox, item);
    for (const idea of body.ideas ?? []) this.replace(this.bag.ideas, idea);
    for (const metric of body.metrics ?? []) this.replace(this.bag.metrics, metric);
    this.drop(this.bag.cards, body.drop?.cards, now);
    this.drop(this.bag.events, body.drop?.events, now);
    this.drop(this.bag.tasks, body.drop?.tasks, now);
    this.drop(this.bag.shopping, body.drop?.shopping, now);
    this.drop(this.bag.recaps, body.drop?.recaps, now);
    this.drop(this.bag.priorities, body.drop?.priorities, now);
    this.drop(this.bag.inbox, body.drop?.inbox, now);
    this.drop(this.bag.ideas, body.drop?.ideas, now);
    this.drop(this.bag.metrics, body.drop?.metrics, now);
    if (body.control) this.bag.control = copy(body.control);
  }

  async views(): Promise<ViewRow[]> {
    return sampleConfig.views.map((view) => ({ ...view }));
  }

  async people(): Promise<PersonRow[]> {
    return sampleConfig.people.map((person) => ({ id: person.id, name: person.name }));
  }

  async cards(): Promise<CardRecord[]> {
    return copy(this.bag.cards);
  }

  async putCard(card: CardRecord): Promise<void> {
    this.replace(this.bag.cards, card);
  }

  async events(): Promise<EventRecord[]> {
    return copy(this.bag.events);
  }

  async putEvent(event: EventRecord): Promise<void> {
    this.replace(this.bag.events, event);
  }

  async tasks(): Promise<TaskRecord[]> {
    return copy(this.bag.tasks);
  }

  async putTask(task: TaskRecord): Promise<void> {
    this.replace(this.bag.tasks, task);
  }

  async shopping(): Promise<ShoppingRecord[]> {
    return copy(this.bag.shopping);
  }

  async putShopping(item: ShoppingRecord): Promise<void> {
    this.replace(this.bag.shopping, item);
  }

  async recaps(): Promise<RecapRecord[]> {
    return copy(this.bag.recaps);
  }

  async putRecap(recap: RecapRecord): Promise<void> {
    this.replace(this.bag.recaps, recap);
  }

  async priorities(): Promise<PriorityRecord[]> {
    return copy(this.bag.priorities);
  }

  async putPriority(row: PriorityRecord): Promise<void> {
    this.replace(this.bag.priorities, row);
  }

  async inbox(): Promise<InboxRecord[]> {
    return copy(this.bag.inbox);
  }

  async putInbox(row: InboxRecord): Promise<void> {
    this.replace(this.bag.inbox, row);
  }

  async ideas(): Promise<IdeaRecord[]> {
    return copy(this.bag.ideas);
  }

  async putIdea(row: IdeaRecord): Promise<void> {
    this.replace(this.bag.ideas, row);
  }

  async metrics(): Promise<MetricRecord[]> {
    return copy(this.bag.metrics);
  }

  async putMetric(row: MetricRecord): Promise<void> {
    this.replace(this.bag.metrics, row);
  }

  async control(): Promise<DisplayControl> {
    return copy(this.bag.control);
  }

  async putControl(control: DisplayControl): Promise<void> {
    this.bag.control = copy(control);
  }

  async saveImage(bytes: Uint8Array, type: ImageKind): Promise<string> {
    if (bytes.length < 1) throw new Error("image");
    return `memory/${crypto.randomUUID()}.${extensionFor(type)}`;
  }

  private replace<T extends { id: string }>(rows: T[], row: T): void {
    const index = rows.findIndex((item) => item.id === row.id);
    const next = copy(row);
    if (index < 0) rows.push(next);
    else rows[index] = next;
  }

  private drop<T extends { id: string; deletedAt: string | null }>(rows: T[], ids: string[] | undefined, now: Date): void {
    if (!ids) return;
    for (const id of ids) {
      const row = rows.find((item) => item.id === id);
      if (row && !row.deletedAt) row.deletedAt = now.toISOString();
    }
  }
}

export function liveCount<T extends { deletedAt: string | null }>(rows: T[]): number {
  return active(rows).length;
}
