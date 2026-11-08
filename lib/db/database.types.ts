export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          args_hash: string
          created_at: string
          id: string
          result: Json
          tool: string
          undo: Json | null
        }
        Insert: {
          args_hash: string
          created_at?: string
          id?: string
          result: Json
          tool: string
          undo?: Json | null
        }
        Update: {
          args_hash?: string
          created_at?: string
          id?: string
          result?: Json
          tool?: string
          undo?: Json | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          body: string | null
          color: string
          created_at: string
          data: Json
          deleted_at: string | null
          expires_at: string | null
          external_id: string | null
          grid_col: number
          grid_col_span: number
          grid_row: number
          grid_row_span: number
          id: string
          kind: Database["public"]["Enums"]["card_kind"]
          locked: boolean
          pinned: boolean
          source: Database["public"]["Enums"]["source_kind"]
          tilt: number
          title: string | null
          updated_at: string
          view_id: string
        }
        Insert: {
          body?: string | null
          color: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          grid_col: number
          grid_col_span: number
          grid_row: number
          grid_row_span: number
          id?: string
          kind: Database["public"]["Enums"]["card_kind"]
          locked?: boolean
          pinned?: boolean
          source: Database["public"]["Enums"]["source_kind"]
          tilt?: number
          title?: string | null
          updated_at?: string
          view_id: string
        }
        Update: {
          body?: string | null
          color?: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          grid_col?: number
          grid_col_span?: number
          grid_row?: number
          grid_row_span?: number
          id?: string
          kind?: Database["public"]["Enums"]["card_kind"]
          locked?: boolean
          pinned?: boolean
          source?: Database["public"]["Enums"]["source_kind"]
          tilt?: number
          title?: string | null
          updated_at?: string
          view_id?: string
        }
        Relationships: []
      }
      config: {
        Row: {
          id: number
          location: Json
          people: Json
          profiles: Json
          quiet_hours: Json
          rules: Json
          theme: Json
          updated_at: string
          views: Json
        }
        Insert: {
          id?: number
          location: Json
          people: Json
          profiles: Json
          quiet_hours: Json
          rules: Json
          theme: Json
          updated_at?: string
          views: Json
        }
        Update: {
          id?: number
          location?: Json
          people?: Json
          profiles?: Json
          quiet_hours?: Json
          rules?: Json
          theme?: Json
          updated_at?: string
          views?: Json
        }
        Relationships: []
      }
      display_control: {
        Row: {
          dimmed: boolean
          id: number
          mode: string
          pinned_until: string | null
          updated_at: string
          view_id: string | null
        }
        Insert: {
          dimmed?: boolean
          id?: number
          mode?: string
          pinned_until?: string | null
          updated_at?: string
          view_id?: string | null
        }
        Update: {
          dimmed?: boolean
          id?: number
          mode?: string
          pinned_until?: string | null
          updated_at?: string
          view_id?: string | null
        }
        Relationships: []
      }
      pin_guard: {
        Row: {
          failures: number
          id: number
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          failures?: number
          id?: number
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          failures?: number
          id?: number
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          all_day: boolean
          created_at: string
          deleted_at: string | null
          ends_at: string
          external_id: string | null
          id: string
          locked: boolean
          person_id: string | null
          source: Database["public"]["Enums"]["source_kind"]
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          deleted_at?: string | null
          ends_at: string
          external_id?: string | null
          id?: string
          locked?: boolean
          person_id?: string | null
          source: Database["public"]["Enums"]["source_kind"]
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          deleted_at?: string | null
          ends_at?: string
          external_id?: string | null
          id?: string
          locked?: boolean
          person_id?: string | null
          source?: Database["public"]["Enums"]["source_kind"]
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_cache: {
        Row: {
          attempted_at: string | null
          etag: string | null
          fetched_at: string | null
          key: string
          ok: boolean
          payload: Json
        }
        Insert: {
          attempted_at?: string | null
          etag?: string | null
          fetched_at?: string | null
          key: string
          ok?: boolean
          payload?: Json
        }
        Update: {
          attempted_at?: string | null
          etag?: string | null
          fetched_at?: string | null
          key?: string
          ok?: boolean
          payload?: Json
        }
        Relationships: []
      }
      ideas: {
        Row: {
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          locked: boolean
          source: Database["public"]["Enums"]["source_kind"]
          tags: string[]
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          locked?: boolean
          source: Database["public"]["Enums"]["source_kind"]
          tags?: string[]
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          locked?: boolean
          source?: Database["public"]["Enums"]["source_kind"]
          tags?: string[]
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          received_at: string
          routed_to: Json | null
          source: Database["public"]["Enums"]["source_kind"]
          status: Database["public"]["Enums"]["inbox_status"]
          text: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          received_at?: string
          routed_to?: Json | null
          source: Database["public"]["Enums"]["source_kind"]
          status?: Database["public"]["Enums"]["inbox_status"]
          text: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          received_at?: string
          routed_to?: Json | null
          source?: Database["public"]["Enums"]["source_kind"]
          status?: Database["public"]["Enums"]["inbox_status"]
          text?: string
        }
        Relationships: []
      }
      metrics: {
        Row: {
          created_at: string
          deleted_at: string | null
          external_id: string | null
          fetched_at: string
          id: string
          key: string
          previous: number | null
          source: Database["public"]["Enums"]["source_kind"]
          value: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          fetched_at?: string
          id?: string
          key: string
          previous?: number | null
          source: Database["public"]["Enums"]["source_kind"]
          value: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          fetched_at?: string
          id?: string
          key?: string
          previous?: number | null
          source?: Database["public"]["Enums"]["source_kind"]
          value?: number
        }
        Relationships: []
      }
      priorities: {
        Row: {
          created_at: string
          deleted_at: string | null
          due_at: string | null
          expires_at: string
          external_id: string | null
          id: string
          locked: boolean
          reason: string
          source: Database["public"]["Enums"]["source_kind"]
          task_id: string | null
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          expires_at: string
          external_id?: string | null
          id?: string
          locked?: boolean
          reason: string
          source: Database["public"]["Enums"]["source_kind"]
          task_id?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          expires_at?: string
          external_id?: string | null
          id?: string
          locked?: boolean
          reason?: string
          source?: Database["public"]["Enums"]["source_kind"]
          task_id?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "priorities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      recaps: {
        Row: {
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          external_id: string | null
          highlights: Json
          id: string
          locked: boolean
          source: Database["public"]["Enums"]["source_kind"]
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          highlights?: Json
          id?: string
          locked?: boolean
          source: Database["public"]["Enums"]["source_kind"]
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          external_id?: string | null
          highlights?: Json
          id?: string
          locked?: boolean
          source?: Database["public"]["Enums"]["source_kind"]
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          category: string | null
          checked: boolean
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          locked: boolean
          qty: number
          source: Database["public"]["Enums"]["source_kind"]
          text: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          checked?: boolean
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          locked?: boolean
          qty?: number
          source: Database["public"]["Enums"]["source_kind"]
          text: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          checked?: boolean
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          locked?: boolean
          qty?: number
          source?: Database["public"]["Enums"]["source_kind"]
          text?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          deleted_at: string | null
          done: boolean
          due_date: string | null
          external_id: string | null
          id: string
          locked: boolean
          source: Database["public"]["Enums"]["source_kind"]
          text: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          deleted_at?: string | null
          done?: boolean
          due_date?: string | null
          external_id?: string | null
          id?: string
          locked?: boolean
          source: Database["public"]["Enums"]["source_kind"]
          text: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          deleted_at?: string | null
          done?: boolean
          due_date?: string | null
          external_id?: string | null
          id?: string
          locked?: boolean
          source?: Database["public"]["Enums"]["source_kind"]
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      card_kind:
        | "photo"
        | "affirmation"
        | "countdown"
        | "word"
        | "progress"
        | "wins"
        | "recap"
        | "note"
      inbox_status: "new" | "routed" | "needs_review"
      source_kind: "manual" | "assistant" | "integration"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      card_kind: [
        "photo",
        "affirmation",
        "countdown",
        "word",
        "progress",
        "wins",
        "recap",
        "note",
      ],
      inbox_status: ["new", "routed", "needs_review"],
      source_kind: ["manual", "assistant", "integration"],
    },
  },
} as const
