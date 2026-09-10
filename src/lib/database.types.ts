export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          id: string
          user_id: string
          name: string | null
          key: string
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name?: string | null
          key: string
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string | null
          key?: string
          created_at?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      edges: {
        Row: {
          certain: boolean
          created_at: string
          id: string
          metadata: Json
          project_id: string
          source: string
          target: string
          type: string
        }
        Insert: {
          certain?: boolean
          created_at?: string
          id?: string
          metadata?: Json
          project_id: string
          source: string
          target: string
          type: string
        }
        Update: {
          certain?: boolean
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string
          source?: string
          target?: string
          type?: string
        }
        Relationships: []
      }
      nodes: {
        Row: {
          created_at: string
          description: string | null
          floor: number
          id: string
          metadata: Json
          name: string | null
          pos_x: number
          pos_y: number
          project_id: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          floor?: number
          id?: string
          metadata?: Json
          name?: string | null
          pos_x?: number
          pos_y?: number
          project_id: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          floor?: number
          id?: string
          metadata?: Json
          name?: string | null
          pos_x?: number
          pos_y?: number
          project_id?: string
          type?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          node_id: string | null
          project_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          node_id?: string | null
          project_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          node_id?: string | null
          project_id?: string
          storage_path?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      match_location: {
        Args: { p_project_id: string; p_embedding: string }
        Returns: { node_id: string; distance: number }[]
      }
      api_load_graph: {
        Args: { p_api_key: string; p_project_id: string }
        Returns: Json
      }
      api_match_location: {
        Args: { p_api_key: string; p_project_id: string; p_embedding: string }
        Returns: string
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]
