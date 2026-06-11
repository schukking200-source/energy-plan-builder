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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aud_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          event_id: string
          id: number
          occurred_at: string
          payload: Json
          prev_hash: string | null
          record_hash: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          event_id?: string
          id?: number
          occurred_at?: string
          payload?: Json
          prev_hash?: string | null
          record_hash: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          event_id?: string
          id?: number
          occurred_at?: string
          payload?: Json
          prev_hash?: string | null
          record_hash?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      id_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          organisation: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          organisation?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          organisation?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      in_measurement: {
        Row: {
          captured_at: string
          captured_by: string
          captured_geo_lat: number | null
          captured_geo_lng: number | null
          created_at: string
          device_meta: Json
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          id: string
          lidar_point_cloud_ref: string | null
          object_ref: string | null
          payload: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          roomplan_json: Json | null
          scan_app: Database["public"]["Enums"]["scan_app"] | null
          scan_format: string | null
          scan_size_bytes: number | null
          snapshot_hash: string | null
          source: Database["public"]["Enums"]["measurement_source"]
          status: Database["public"]["Enums"]["measurement_status"]
          updated_at: string
          version: number
        }
        Insert: {
          captured_at?: string
          captured_by: string
          captured_geo_lat?: number | null
          captured_geo_lng?: number | null
          created_at?: string
          device_meta?: Json
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          id?: string
          lidar_point_cloud_ref?: string | null
          object_ref?: string | null
          payload?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          roomplan_json?: Json | null
          scan_app?: Database["public"]["Enums"]["scan_app"] | null
          scan_format?: string | null
          scan_size_bytes?: number | null
          snapshot_hash?: string | null
          source?: Database["public"]["Enums"]["measurement_source"]
          status?: Database["public"]["Enums"]["measurement_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          captured_at?: string
          captured_by?: string
          captured_geo_lat?: number | null
          captured_geo_lng?: number | null
          created_at?: string
          device_meta?: Json
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          id?: string
          lidar_point_cloud_ref?: string | null
          object_ref?: string | null
          payload?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          roomplan_json?: Json | null
          scan_app?: Database["public"]["Enums"]["scan_app"] | null
          scan_format?: string | null
          scan_size_bytes?: number | null
          snapshot_hash?: string | null
          source?: Database["public"]["Enums"]["measurement_source"]
          status?: Database["public"]["Enums"]["measurement_status"]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      roadmap_task: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_golive_blocker: boolean
          is_project_blocker: boolean
          module: string | null
          module_label: string | null
          module_order: number | null
          owner: string | null
          phase: number
          phase_label: string
          sort_order: number
          status: Database["public"]["Enums"]["roadmap_status"]
          title: string
          type: Database["public"]["Enums"]["roadmap_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_golive_blocker?: boolean
          is_project_blocker?: boolean
          module?: string | null
          module_label?: string | null
          module_order?: number | null
          owner?: string | null
          phase: number
          phase_label: string
          sort_order?: number
          status?: Database["public"]["Enums"]["roadmap_status"]
          title: string
          type?: Database["public"]["Enums"]["roadmap_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_golive_blocker?: boolean
          is_project_blocker?: boolean
          module?: string | null
          module_label?: string | null
          module_order?: number | null
          owner?: string | null
          phase?: number
          phase_label?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["roadmap_status"]
          title?: string
          type?: Database["public"]["Enums"]["roadmap_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_rls_selftest: {
        Args: { adv_id: string; res_id: string; rev_id: string }
        Returns: Json
      }
      current_user_has_any_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "bewoner"
        | "adviseur"
        | "adviesbureau_admin"
        | "kwaliteitscommissie"
        | "steekproef"
        | "admin"
      evidence_level: "low" | "medium" | "high"
      measurement_source: "manual" | "measured" | "inferred" | "lidar_derived"
      measurement_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "approved"
        | "rejected"
      roadmap_status: "open" | "in_progress" | "done" | "blocker"
      roadmap_type: "mvp0" | "enterprise"
      scan_app:
        | "polycam"
        | "scaniverse"
        | "scanner3d_app"
        | "canvas"
        | "roomplan_native"
        | "manual"
        | "other"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "bewoner",
        "adviseur",
        "adviesbureau_admin",
        "kwaliteitscommissie",
        "steekproef",
        "admin",
      ],
      evidence_level: ["low", "medium", "high"],
      measurement_source: ["manual", "measured", "inferred", "lidar_derived"],
      measurement_status: [
        "draft",
        "submitted",
        "in_review",
        "approved",
        "rejected",
      ],
      roadmap_status: ["open", "in_progress", "done", "blocker"],
      roadmap_type: ["mvp0", "enterprise"],
      scan_app: [
        "polycam",
        "scaniverse",
        "scanner3d_app",
        "canvas",
        "roomplan_native",
        "manual",
        "other",
      ],
    },
  },
} as const
