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
      games: {
        Row: {
          center_lat: number
          center_lng: number
          chest_current_phase: number
          chest_opened: boolean
          chest_progress_pct: number
          chest_unlocked_steps: number
          code: string
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          is_public: boolean
          movement_mode: string
          name: string
          play_area_radius: number
          player_speed: string
          settings: Json | null
          started_at: string | null
          status: string
          treasure_lat: number
          treasure_lng: number
          winner?: string | null
          active_crates?: Json | null
          active_wild_pets?: Json | null
          active_dropped_items?: Json | null
          active_loot?: Json | null
        }
        Insert: {
          center_lat: number
          center_lng: number
          chest_current_phase?: number
          chest_opened?: boolean
          chest_progress_pct?: number
          chest_unlocked_steps?: number
          code?: string
          created_at?: string
          ended_at?: string | null
          host_id: string
          id?: string
          is_public?: boolean
          movement_mode?: string
          name?: string
          play_area_radius?: number
          player_speed?: string
          settings?: Json | null
          started_at?: string | null
          status?: string
          treasure_lat: number
          treasure_lng: number
          winner?: string | null
          active_crates?: Json | null
          active_wild_pets?: Json | null
          active_dropped_items?: Json | null
          active_loot?: Json | null
        }
        Update: {
          center_lat?: number
          center_lng?: number
          chest_current_phase?: number
          chest_opened?: boolean
          chest_progress_pct?: number
          chest_unlocked_steps?: number
          code?: string
          created_at?: string
          ended_at?: string | null
          host_id?: string
          id?: string
          is_public?: boolean
          movement_mode?: string
          name?: string
          play_area_radius?: number
          player_speed?: string
          settings?: Json | null
          started_at?: string | null
          status?: string
          treasure_lat?: number
          treasure_lng?: number
          winner?: string | null
          active_crates?: Json | null
          active_wild_pets?: Json | null
          active_dropped_items?: Json | null
          active_loot?: Json | null
        }
        Relationships: []
      }
      match_stats: {
        Row: {
          chests_opened?: number
          crates_opened: number
          created_at: string
          damage_dealt: number
          game_id: string | null
          id: string
          monster_kills: number
          nickname: string
          revives_done: number
          role: string
          score: number | null
          won: boolean
        }
        Insert: {
          chests_opened?: number
          crates_opened?: number
          created_at?: string
          damage_dealt?: number
          game_id?: string | null
          id?: string
          monster_kills?: number
          nickname: string
          revives_done?: number
          role: string
          score?: number | null
          won?: boolean
        }
        Update: {
          chests_opened?: number
          crates_opened?: number
          created_at?: string
          damage_dealt?: number
          game_id?: string | null
          id?: string
          monster_kills?: number
          nickname?: string
          revives_done?: number
          role?: string
          score?: number | null
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "match_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          chests_opened?: number
          crates_opened: number
          damage_dealt: number
          game_id: string
          hp: number
          id: string
          inventory: Json | null
          is_alive: boolean
          joined_at: string
          lat: number | null
          lng: number | null
          max_hp: number
          monster_kills: number
          nickname: string
          pets: Json | null
          revives_done: number
          role: string
          status: string | null
          user_id: string
        }
        Insert: {
          chests_opened?: number
          crates_opened?: number
          damage_dealt?: number
          game_id: string
          hp?: number
          id?: string
          inventory?: Json | null
          is_alive?: boolean
          joined_at?: string
          lat?: number | null
          lng?: number | null
          max_hp?: number
          monster_kills?: number
          nickname: string
          pets?: Json | null
          revives_done?: number
          role: string
          status?: string | null
          user_id: string
        }
        Update: {
          chests_opened?: number
          crates_opened?: number
          damage_dealt?: number
          game_id?: string
          hp?: number
          id?: string
          inventory?: Json | null
          is_alive?: boolean
          joined_at?: string
          lat?: number | null
          lng?: number | null
          max_hp?: number
          monster_kills?: number
          nickname?: string
          pets?: Json | null
          revives_done?: number
          role?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard: {
        Row: {
          crates_opened: number | null
          created_at: string | null
          damage_dealt: number | null
          id: string | null
          monster_kills: number | null
          nickname: string | null
          revives_done: number | null
          role: string | null
          score: number | null
          won: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_room_code: { Args: never; Returns: string }
      set_game_status: {
        Args: { p_game_id: string; p_status: string }
        Returns: undefined
      }
      finish_game_victory: {
        Args: { p_game_id: string; p_winner_nickname?: string }
        Returns: undefined
      }
      update_chest_progress: {
        Args: {
          p_game_id: string
          p_unlocked_steps: number
          p_current_phase: number
          p_progress_pct: number
        }
        Returns: undefined
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
