// lib/db/types.ts
//
// Dibuat manual mengikuti seluruh migration di supabase/migrations/*.sql.
// GANTI file ini dengan hasil asli `npm run gen:types` setelah project Supabase
// dibuat & migration dijalankan (§10 dokumentasi backend) — supaya tipe RPC
// return value dan enum benar-benar sinkron dengan database, bukan diketik manual.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string
          name: string
          slug: string
          address: string | null
          status: 'pending_verification' | 'active' | 'suspended' | 'rejected'
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['businesses']['Row']> & { name: string; slug: string }
        Update: Partial<Database['public']['Tables']['businesses']['Row']>
        Relationships: []
      }
      staff: {
        Row: {
          id: string
          business_id: string
          auth_user_id: string
          username: string
          full_name: string
          role: 'admin' | 'owner' | 'staff'
          is_active: boolean
          failed_login_attempts: number
          locked_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['staff']['Row']> & {
          business_id: string
          auth_user_id: string
          username: string
          full_name: string
        }
        Update: Partial<Database['public']['Tables']['staff']['Row']>
        Relationships: []
      }
      staff_employment: {
        Row: {
          staff_id: string
          business_id: string
          employment_type: 'full_time' | 'part_time' | 'contract' | null
          base_salary: number | null
          hire_date: string | null
          bank_name: string | null
          bank_account_number: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['staff_employment']['Row']> & {
          staff_id: string
          business_id: string
        }
        Update: Partial<Database['public']['Tables']['staff_employment']['Row']>
        Relationships: []
      }
      locations: {
        Row: {
          id: string
          business_id: string
          name: string
          type: 'toko' | 'gudang'
          address: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['locations']['Row']> & {
          business_id: string
          name: string
          type: 'toko' | 'gudang'
        }
        Update: Partial<Database['public']['Tables']['locations']['Row']>
        Relationships: []
      }
      car_models: {
        Row: {
          id: string
          brand: string
          name: string
          era_group: string | null
          year_start: number | null
          year_end: number | null
        }
        Insert: Partial<Database['public']['Tables']['car_models']['Row']> & { name: string }
        Update: Partial<Database['public']['Tables']['car_models']['Row']>
        Relationships: []
      }
      products: {
        Row: {
          id: string
          business_id: string
          part_number: string | null
          name: string
          category: string | null
          unit: string
          description: string | null
          min_threshold: number | null
          unit_cost: number
          selling_price: number
          preferred_supplier_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['products']['Row']> & { business_id: string; name: string }
        Update: Partial<Database['public']['Tables']['products']['Row']>
        Relationships: []
      }
      product_model_compatibility: {
        Row: { product_id: string; car_model_id: string }
        Insert: { product_id: string; car_model_id: string }
        Update: Partial<{ product_id: string; car_model_id: string }>
        Relationships: []
      }
      product_aliases: {
        Row: { id: string; product_id: string; alias: string; source: string | null; created_at: string }
        Insert: Partial<Database['public']['Tables']['product_aliases']['Row']> & {
          product_id: string
          alias: string
        }
        Update: Partial<Database['public']['Tables']['product_aliases']['Row']>
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string
          business_id: string
          name: string
          contact_person: string | null
          phone: string | null
          address: string | null
          notes: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['suppliers']['Row']> & { business_id: string; name: string }
        Update: Partial<Database['public']['Tables']['suppliers']['Row']>
        Relationships: []
      }
      stock: {
        Row: {
          business_id: string
          product_id: string
          location_id: string
          quantity: number
          reserved_quantity: number
          available_quantity: number
          last_updated_at: string
          last_synced_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['stock']['Row']> & {
          business_id: string
          product_id: string
          location_id: string
        }
        Update: Partial<Database['public']['Tables']['stock']['Row']>
        Relationships: []
      }
      stock_transactions: {
        Row: {
          id: string
          business_id: string
          product_id: string
          location_id: string
          transaction_type: 'masuk' | 'keluar' | 'transfer_out' | 'transfer_in' | 'retur' | 'adjustment_in' | 'adjustment_out'
          quantity: number
          unit_price: number | null
          total_value: number
          supplier_id: string | null
          idempotency_key: string | null
          related_transaction_id: string | null
          staff_id: string | null
          agent_audit_log_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['stock_transactions']['Row']> & {
          business_id: string
          product_id: string
          location_id: string
          transaction_type: Database['public']['Tables']['stock_transactions']['Row']['transaction_type']
          quantity: number
        }
        Update: Partial<Database['public']['Tables']['stock_transactions']['Row']>
        Relationships: []
      }
      stock_opname: {
        Row: {
          id: string
          business_id: string
          product_id: string | null
          location_id: string | null
          system_quantity: number
          counted_quantity: number
          discrepancy: number
          staff_id: string | null
          notes: string | null
          opname_date: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['stock_opname']['Row']> & {
          business_id: string
          system_quantity: number
          counted_quantity: number
        }
        Update: Partial<Database['public']['Tables']['stock_opname']['Row']>
        Relationships: []
      }
      receipt_imports: {
        Row: {
          id: string
          business_id: string
          source: 'ocr_photo' | 'excel' | 'manual'
          file_url: string | null
          ocr_provider: string | null
          raw_ocr_text: string | null
          status: 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed'
          uploaded_by: string | null
          created_at: string
          processed_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['receipt_imports']['Row']> & {
          business_id: string
          source: Database['public']['Tables']['receipt_imports']['Row']['source']
        }
        Update: Partial<Database['public']['Tables']['receipt_imports']['Row']>
        Relationships: []
      }
      receipt_import_items: {
        Row: {
          id: string
          import_id: string
          raw_line_text: string | null
          matched_product_id: string | null
          suggested_quantity: number | null
          suggested_transaction_type: Database['public']['Tables']['stock_transactions']['Row']['transaction_type'] | null
          match_confidence: number | null
          status: 'unmatched' | 'matched' | 'confirmed' | 'rejected'
          reviewed_by: string | null
          resulting_transaction_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['receipt_import_items']['Row']> & { import_id: string }
        Update: Partial<Database['public']['Tables']['receipt_import_items']['Row']>
        Relationships: []
      }
      agent_conversations: {
        Row: {
          id: string
          business_id: string
          staff_id: string | null
          channel: string
          summary: string | null
          started_at: string
          ended_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['agent_conversations']['Row']> & { business_id: string }
        Update: Partial<Database['public']['Tables']['agent_conversations']['Row']>
        Relationships: []
      }
      agent_messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant' | 'tool'
          agent_type: string | null
          content: string | null
          tool_calls: Json | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['agent_messages']['Row']> & {
          conversation_id: string
          role: Database['public']['Tables']['agent_messages']['Row']['role']
        }
        Update: Partial<Database['public']['Tables']['agent_messages']['Row']>
        Relationships: []
      }
      agent_audit_log: {
        Row: {
          id: string
          business_id: string
          conversation_id: string | null
          agent_type: string
          tool_name: string
          input_params: Json
          decision_reason: string | null
          requires_confirmation: boolean
          status: 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed'
          confirmed_by: string | null
          confirmed_at: string | null
          related_transaction_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['agent_audit_log']['Row']> & {
          business_id: string
          agent_type: string
          tool_name: string
          input_params: Json
        }
        Update: Partial<Database['public']['Tables']['agent_audit_log']['Row']>
        Relationships: []
      }
      agent_execution_metrics: {
        Row: {
          id: string
          business_id: string
          conversation_id: string | null
          agent_type: string
          model_name: string | null
          prompt_tokens: number | null
          completion_tokens: number | null
          context_length_at_call: number | null
          latency_ms: number | null
          succeeded: boolean
          error_message: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['agent_execution_metrics']['Row']> & {
          business_id: string
          agent_type: string
        }
        Update: Partial<Database['public']['Tables']['agent_execution_metrics']['Row']>
        Relationships: []
      }
      reorder_suggestions: {
        Row: {
          id: string
          business_id: string
          product_id: string | null
          suggested_quantity: number
          reason: string | null
          trend_snapshot: Json | null
          status: 'pending' | 'acknowledged' | 'ordered' | 'dismissed'
          acknowledged_by: string | null
          suggested_supplier_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['reorder_suggestions']['Row']> & {
          business_id: string
          suggested_quantity: number
        }
        Update: Partial<Database['public']['Tables']['reorder_suggestions']['Row']>
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          staff_id: string | null
          endpoint: string
          keys: Json
          is_active: boolean
          last_seen_at: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['push_subscriptions']['Row']> & { endpoint: string; keys: Json }
        Update: Partial<Database['public']['Tables']['push_subscriptions']['Row']>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          business_id: string
          staff_id: string | null
          type: 'dead_stock' | 'low_stock' | 'reorder_suggestion' | 'system'
          title: string
          body: string | null
          related_id: string | null
          sent_at: string | null
          read_at: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          business_id: string
          type: Database['public']['Tables']['notifications']['Row']['type']
          title: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Row']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      search_products: {
        Args: { p_business_id: string; p_query: string; p_limit?: number }
        Returns: {
          product_id: string
          name: string
          part_number: string | null
          matched_via: string
          similarity_score: number
        }[]
      }
      get_sales_trend: {
        Args: { p_product_id: string; p_months: number }
        Returns: { period: string; total_keluar: number }[]
      }
      increment_ocr_rate_limit: {
        Args: { p_business_id: string; p_window_minutes: number; p_max_requests: number }
        Returns: { allowed: boolean; current_count: number; limit_count: number; window_start: string }[]
      }
      record_stock_transaction: {
        Args: {
          p_business_id: string
          p_product_id: string
          p_location_id: string
          p_type: Database['public']['Tables']['stock_transactions']['Row']['transaction_type']
          p_quantity: number
          p_staff_id: string
          p_unit_price?: number | null
          p_supplier_id?: string | null
          p_idempotency_key?: string | null
          p_audit_log_id?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      transfer_stock: {
        Args: {
          p_business_id: string
          p_product_id: string
          p_quantity: number
          p_from_location_id: string
          p_to_location_id: string
          p_staff_id: string
          p_audit_log_id?: string | null
          p_idempotency_key?: string | null
        }
        Returns: void
      }
      reserve_stock: {
        Args: { p_product_id: string; p_location_id: string; p_quantity: number }
        Returns: void
      }
      release_reservation: {
        Args: { p_product_id: string; p_location_id: string; p_quantity: number }
        Returns: void
      }
      expire_stale_pending_reservations: {
        Args: { p_business_id: string; p_older_than_minutes?: number }
        Returns: number
      }
      confirm_update_stock: {
        Args: { p_audit_log_id: string; p_staff_id: string }
        // ok:true -> transaction_id terisi, error kosong; ok:false -> sebaliknya.
        // Bukan discriminated union supaya akses `result?.error` di route.ts tidak
        // butuh narrowing manual dulu (json dari plpgsql tidak divalidasi runtime).
        Returns: { ok: boolean; transaction_id?: string; error?: string; status?: string }
      }
      confirm_transfer_stock: {
        Args: { p_audit_log_id: string; p_staff_id: string }
        Returns: { ok: boolean; error?: string; status?: string }
      }
      approve_business_signup: { Args: { p_business_id: string }; Returns: void }
      reject_business_signup: { Args: { p_business_id: string; p_reason?: string | null }; Returns: void }
      auth_business_id: { Args: Record<string, never>; Returns: string }
      is_super_admin: { Args: Record<string, never>; Returns: boolean }
      is_full_access: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: {
      user_role: 'admin' | 'owner' | 'staff'
      location_type: 'toko' | 'gudang'
      transaction_type: 'masuk' | 'keluar' | 'transfer_out' | 'transfer_in' | 'retur' | 'adjustment_in' | 'adjustment_out'
      audit_status: 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed'
      import_source: 'ocr_photo' | 'excel' | 'manual'
      import_status: 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed'
      import_item_status: 'unmatched' | 'matched' | 'confirmed' | 'rejected'
      suggestion_status: 'pending' | 'acknowledged' | 'ordered' | 'dismissed'
      notification_type: 'dead_stock' | 'low_stock' | 'reorder_suggestion' | 'system'
      message_role: 'user' | 'assistant' | 'tool'
      employment_type: 'full_time' | 'part_time' | 'contract'
    }
  }
}
