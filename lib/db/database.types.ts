// Interim types for supabase/migrations/20261107202617_init_schema.sql.
// After the project is linked, replace this file with `pnpm gen:types`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type SourceKind = "manual" | "assistant" | "integration";
type CardKind = "photo" | "affirmation" | "countdown" | "word" | "progress" | "wins" | "recap" | "note";
type InboxStatus = "new" | "routed" | "needs_review";

type Table<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: { [K in keyof Row]?: Row[K] };
  Update: { [K in keyof Row]?: Row[K] };
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      config: Table<{
        id: number;
        theme: Json;
        people: Json;
        views: Json;
        profiles: Json;
        quiet_hours: Json;
        location: Json;
        rules: Json;
        updated_at: string;
      }>;
      cards: Table<{
        id: string;
        view_id: string;
        kind: CardKind;
        title: string | null;
        body: string | null;
        color: string;
        tilt: number;
        grid_col: number;
        grid_row: number;
        grid_col_span: number;
        grid_row_span: number;
        expires_at: string | null;
        pinned: boolean;
        source: SourceKind;
        locked: boolean;
        external_id: string | null;
        data: Json;
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      events: Table<{
        id: string;
        title: string;
        starts_at: string;
        ends_at: string;
        all_day: boolean;
        person_id: string | null;
        source: SourceKind;
        locked: boolean;
        external_id: string | null;
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      tasks: Table<{
        id: string;
        text: string;
        done: boolean;
        assignee_id: string | null;
        due_date: string | null;
        source: SourceKind;
        locked: boolean;
        external_id: string | null;
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      shopping_items: Table<{
        id: string;
        text: string;
        qty: number;
        unit: string | null;
        category: string | null;
        checked: boolean;
        source: SourceKind;
        locked: boolean;
        external_id: string | null;
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      recaps: Table<{
        id: string;
        text: string;
        highlights: Json;
        expires_at: string | null;
        source: SourceKind;
        locked: boolean;
        external_id: string | null;
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      priorities: Table<{
        id: string;
        text: string;
        reason: string;
        due_at: string | null;
        task_id: string | null;
        expires_at: string;
        source: SourceKind;
        locked: boolean;
        external_id: string | null;
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      inbox_items: Table<{
        id: string;
        text: string;
        received_at: string;
        status: InboxStatus;
        routed_to: Json | null;
        source: SourceKind;
        deleted_at: string | null;
        created_at: string;
      }>;
      ideas: Table<{
        id: string;
        text: string;
        tags: string[];
        source: SourceKind;
        locked: boolean;
        external_id: string | null;
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      metrics: Table<{
        id: string;
        key: string;
        value: number;
        previous: number | null;
        fetched_at: string;
        source: SourceKind;
        external_id: string | null;
        deleted_at: string | null;
        created_at: string;
      }>;
      audit_log: Table<{
        id: string;
        tool: string;
        args_hash: string;
        result: Json;
        undo: Json | null;
        created_at: string;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      source_kind: SourceKind;
      card_kind: CardKind;
      inbox_status: InboxStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
