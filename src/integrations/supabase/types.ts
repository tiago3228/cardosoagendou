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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      appointment_services: {
        Row: {
          appointment_id: string
          business_id: string
          duration_minutes: number
          id: string
          price_cents: number
          service_id: string | null
          service_name: string
        }
        Insert: {
          appointment_id: string
          business_id: string
          duration_minutes: number
          id?: string
          price_cents: number
          service_id?: string | null
          service_name: string
        }
        Update: {
          appointment_id?: string
          business_id?: string
          duration_minutes?: number
          id?: string
          price_cents?: number
          service_id?: string | null
          service_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          business_id: string
          cancel_reason: string | null
          client_id: string | null
          client_name: string
          client_whatsapp: string
          created_at: string
          duration_minutes: number
          ends_at: string
          id: string
          notes: string | null
          professional_id: string
          snapshot: Json
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          total_price_cents: number
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_reason?: string | null
          client_id?: string | null
          client_name: string
          client_whatsapp: string
          created_at?: string
          duration_minutes: number
          ends_at: string
          id?: string
          notes?: string | null
          professional_id: string
          snapshot?: Json
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          total_price_cents?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_reason?: string | null
          client_id?: string | null
          client_name?: string
          client_whatsapp?: string
          created_at?: string
          duration_minutes?: number
          ends_at?: string
          id?: string
          notes?: string | null
          professional_id?: string
          snapshot?: Json
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          total_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          business_id: string | null
          created_at: string
          data: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          business_id?: string | null
          created_at?: string
          data?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          business_id?: string | null
          created_at?: string
          data?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          business_id: string
          closed: boolean
          closes_at: string
          id: string
          opens_at: string
          weekday: number
        }
        Insert: {
          business_id: string
          closed?: boolean
          closes_at?: string
          id?: string
          opens_at?: string
          weekday: number
        }
        Update: {
          business_id?: string
          closed?: boolean
          closes_at?: string
          id?: string
          opens_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          active: boolean
          address: string | null
          booking_policy: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          cover_url: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          max_advance_days: number
          min_notice_minutes: number
          name: string
          slot_interval_minutes: number
          slug: string
          timezone: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          booking_policy?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_advance_days?: number
          min_notice_minutes?: number
          name: string
          slot_interval_minutes?: number
          slug: string
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          booking_policy?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_advance_days?: number
          min_notice_minutes?: number
          name?: string
          slot_interval_minutes?: number
          slug?: string
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          whatsapp: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          whatsapp: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string | null
          business_id: string
          channel: string
          created_at: string
          id: string
          payload: Json
          recipient: string
          sent_at: string | null
          status: string
          template: string
        }
        Insert: {
          appointment_id?: string | null
          business_id: string
          channel?: string
          created_at?: string
          id?: string
          payload?: Json
          recipient: string
          sent_at?: string | null
          status?: string
          template: string
        }
        Update: {
          appointment_id?: string | null
          business_id?: string
          channel?: string
          created_at?: string
          id?: string
          payload?: Json
          recipient?: string
          sent_at?: string | null
          status?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          business_id: string | null
          created_at: string
          event_type: string
          external_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          event_type: string
          external_id: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          event_type?: string
          external_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          annual_months_charged: number
          annual_price_cents: number
          code: string
          created_at: string
          description: string | null
          id: string
          monthly_price_cents: number
          name: string
          professional_limit: number | null
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          annual_months_charged?: number
          annual_price_cents: number
          code: string
          created_at?: string
          description?: string | null
          id?: string
          monthly_price_cents: number
          name: string
          professional_limit?: number | null
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          annual_months_charged?: number
          annual_price_cents?: number
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          monthly_price_cents?: number
          name?: string
          professional_limit?: number | null
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          business_id: string
          cost_cents: number
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          min_stock: number
          name: string
          price_cents: number
          sku: string | null
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          min_stock?: number
          name: string
          price_cents?: number
          sku?: string | null
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          min_stock?: number
          name?: string
          price_cents?: number
          sku?: string | null
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_hours: {
        Row: {
          business_id: string
          enabled: boolean
          ends_at: string
          id: string
          professional_id: string
          starts_at: string
          weekday: number
        }
        Insert: {
          business_id: string
          enabled?: boolean
          ends_at?: string
          id?: string
          professional_id: string
          starts_at?: string
          weekday: number
        }
        Update: {
          business_id?: string
          enabled?: boolean
          ends_at?: string
          id?: string
          professional_id?: string
          starts_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_hours_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_services: {
        Row: {
          business_id: string
          professional_id: string
          service_id: string
        }
        Insert: {
          business_id: string
          professional_id: string
          service_id: string
        }
        Update: {
          business_id?: string
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          bio: string | null
          business_id: string
          commission_percent: number
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          photo_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bio?: string | null
          business_id: string
          commission_percent?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          photo_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bio?: string | null
          business_id?: string
          commission_percent?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          business_id: string
          category: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          image_url: string | null
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          image_url?: string | null
          name: string
          price_cents?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          image_url?: string | null
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          quantity: number
          reason: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          business_id: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          pending_billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_plan_id: string | null
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          business_id: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pending_billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_plan_id?: string | null
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          business_id?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pending_billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_plan_id?: string | null
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          business_id: string
          created_at: string
          description: string | null
          id: string
          occurred_at: string
          professional_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          occurred_at?: string
          professional_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          occurred_at?: string
          professional_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      business_professional_limit: {
        Args: { _business_id: string }
        Returns: number
      }
      has_business_role: {
        Args: {
          _business_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_business_member: {
        Args: { _business_id: string; _user_id: string }
        Returns: boolean
      }
      is_master: { Args: { _user_id: string }; Returns: boolean }
      my_professional_id: { Args: { _business_id: string }; Returns: string }
    }
    Enums: {
      app_role: "master" | "owner" | "professional"
      appointment_status:
        | "PENDING"
        | "CONFIRMED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELED"
        | "NO_SHOW"
      billing_interval: "MONTHLY" | "ANNUAL"
      business_type:
        | "BARBERSHOP"
        | "HAIR_SALON"
        | "BEAUTY_SALON"
        | "AESTHETIC_CLINIC"
        | "NAIL_SALON"
        | "MASSAGE"
        | "TATTOO"
        | "THERAPY"
        | "OTHER"
      payment_method: "PIX" | "CREDIT_CARD"
      stock_movement_type: "IN" | "OUT" | "ADJUST"
      subscription_status:
        | "TRIALING"
        | "ACTIVE"
        | "PAST_DUE"
        | "SUSPENDED"
        | "CANCELED"
      transaction_type:
        | "SERVICE_INCOME"
        | "PRODUCT_INCOME"
        | "COMMISSION"
        | "EXPENSE"
        | "SUBSCRIPTION"
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
      app_role: ["master", "owner", "professional"],
      appointment_status: [
        "PENDING",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELED",
        "NO_SHOW",
      ],
      billing_interval: ["MONTHLY", "ANNUAL"],
      business_type: [
        "BARBERSHOP",
        "HAIR_SALON",
        "BEAUTY_SALON",
        "AESTHETIC_CLINIC",
        "NAIL_SALON",
        "MASSAGE",
        "TATTOO",
        "THERAPY",
        "OTHER",
      ],
      payment_method: ["PIX", "CREDIT_CARD"],
      stock_movement_type: ["IN", "OUT", "ADJUST"],
      subscription_status: [
        "TRIALING",
        "ACTIVE",
        "PAST_DUE",
        "SUSPENDED",
        "CANCELED",
      ],
      transaction_type: [
        "SERVICE_INCOME",
        "PRODUCT_INCOME",
        "COMMISSION",
        "EXPENSE",
        "SUBSCRIPTION",
      ],
    },
  },
} as const
