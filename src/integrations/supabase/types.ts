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
      incidents_audit_log: {
        Row: {
          assigned_officers: Json
          block: string | null
          confidence: number
          created_at: string
          daynight: string | null
          detected_at: string
          dispatch_channel: string | null
          dispatch_count: number
          dispatched_at: string | null
          field_notes: string | null
          fire_key: string
          frp: number
          id: string
          lat: number
          lng: number
          proof_image_urls: string[]
          resolved_at: string | null
          resolved_by: string | null
          satellite: string | null
          status: string
          status_history: Json
          updated_at: string
          village: string | null
          village_distance_km: number | null
        }
        Insert: {
          assigned_officers?: Json
          block?: string | null
          confidence?: number
          created_at?: string
          daynight?: string | null
          detected_at: string
          dispatch_channel?: string | null
          dispatch_count?: number
          dispatched_at?: string | null
          field_notes?: string | null
          fire_key: string
          frp?: number
          id?: string
          lat: number
          lng: number
          proof_image_urls?: string[]
          resolved_at?: string | null
          resolved_by?: string | null
          satellite?: string | null
          status?: string
          status_history?: Json
          updated_at?: string
          village?: string | null
          village_distance_km?: number | null
        }
        Update: {
          assigned_officers?: Json
          block?: string | null
          confidence?: number
          created_at?: string
          daynight?: string | null
          detected_at?: string
          dispatch_channel?: string | null
          dispatch_count?: number
          dispatched_at?: string | null
          field_notes?: string | null
          fire_key?: string
          frp?: number
          id?: string
          lat?: number
          lng?: number
          proof_image_urls?: string[]
          resolved_at?: string | null
          resolved_by?: string | null
          satellite?: string | null
          status?: string
          status_history?: Json
          updated_at?: string
          village?: string | null
          village_distance_km?: number | null
        }
        Relationships: []
      }
      officer_directory: {
        Row: {
          block: string
          cluster_officer_contact: string | null
          cluster_officer_name: string | null
          created_at: string
          district: string
          dsp_contact: string | null
          dsp_name: string | null
          hb_no: string | null
          id: string
          lat: number | null
          lng: number | null
          location_source: string | null
          nodal_officer_contact: string | null
          nodal_officer_designation: string | null
          nodal_officer_name: string | null
          patwari_contact: string | null
          patwari_name: string | null
          s_no: number | null
          sdm_contact: string | null
          sdm_name: string | null
          sho_contact: string | null
          sho_name: string | null
          tehsil: string | null
          thana: string | null
          village: string
        }
        Insert: {
          block: string
          cluster_officer_contact?: string | null
          cluster_officer_name?: string | null
          created_at?: string
          district?: string
          dsp_contact?: string | null
          dsp_name?: string | null
          hb_no?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: string | null
          nodal_officer_contact?: string | null
          nodal_officer_designation?: string | null
          nodal_officer_name?: string | null
          patwari_contact?: string | null
          patwari_name?: string | null
          s_no?: number | null
          sdm_contact?: string | null
          sdm_name?: string | null
          sho_contact?: string | null
          sho_name?: string | null
          tehsil?: string | null
          thana?: string | null
          village: string
        }
        Update: {
          block?: string
          cluster_officer_contact?: string | null
          cluster_officer_name?: string | null
          created_at?: string
          district?: string
          dsp_contact?: string | null
          dsp_name?: string | null
          hb_no?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_source?: string | null
          nodal_officer_contact?: string | null
          nodal_officer_designation?: string | null
          nodal_officer_name?: string | null
          patwari_contact?: string | null
          patwari_name?: string | null
          s_no?: number | null
          sdm_contact?: string | null
          sdm_name?: string | null
          sho_contact?: string | null
          sho_name?: string | null
          tehsil?: string | null
          thana?: string | null
          village?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          telegram_chat_id: string | null
          telegram_handle: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          telegram_chat_id?: string | null
          telegram_handle?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          telegram_chat_id?: string | null
          telegram_handle?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_incident_dispatch: {
        Args: { _channel: string; _fire_key: string; _force?: boolean }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
