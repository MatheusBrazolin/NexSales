export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type PaymentMethod = 'cash' | 'credit' | 'debit' | 'pix' | 'fiado'

export type UserRole = 'admin' | 'employee'

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          sale_price: number
          cost_price: number
          stock_quantity: number
          min_stock: number
          category_id: string | null
          is_active: boolean
          track_stock: boolean
          created_at: string
          updated_at: string
          // ---- Colunas CALCULADAS (computed columns do PostgREST) ----
          // Não existem na tabela: são funções que recebem a linha e o
          // PostgREST expõe como se fossem colunas. Dá para filtrar por
          // elas sempre; só aparecem nos dados se forem pedidas no select
          // — por isso são opcionais aqui.
          /** Nome sem acento e em minúsculas. Ver 20261127000008. */
          name_norm?: string
          /** free (sem controle) | out (zerado) | low (<= mínimo) | ok. Ver 20261128000000. */
          stock_status?: 'free' | 'out' | 'low' | 'ok'
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          sale_price: number
          cost_price: number
          stock_quantity?: number
          min_stock?: number
          category_id?: string | null
          is_active?: boolean
          track_stock?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          sale_price?: number
          cost_price?: number
          stock_quantity?: number
          min_stock?: number
          category_id?: string | null
          is_active?: boolean
          track_stock?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          }
        ]
      }
      customers: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          phone?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          id: string
          customer_id: string
          amount: number
          notes: string | null
          recorded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          amount: number
          notes?: string | null
          recorded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          amount?: number
          notes?: string | null
          recorded_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'debt_payments_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          }
        ]
      }
      sales: {
        Row: {
          id: string
          total_amount: number
          /** Desconto aplicado no total. total_amount já vem líquido. */
          discount_amount: number
          payment_method: PaymentMethod
          notes: string | null
          seller_id: string
          created_at: string
          client_uuid: string | null
          customer_id: string | null
        }
        Insert: {
          id?: string
          total_amount: number
          discount_amount?: number
          payment_method: PaymentMethod
          notes?: string | null
          seller_id: string
          created_at?: string
          client_uuid?: string | null
          customer_id?: string | null
        }
        Update: {
          id?: string
          total_amount?: number
          discount_amount?: number
          payment_method?: PaymentMethod
          notes?: string | null
          seller_id?: string
          created_at?: string
          client_uuid?: string | null
          customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sales_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          }
        ]
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          subtotal: number
          item_description: string | null
          unit_cost?: number
          list_price?: number
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          subtotal: number
          item_description?: string | null
        }
        Update: {
          id?: string
          sale_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          subtotal?: number
          item_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sale_items_sale_id_fkey'
            columns: ['sale_id']
            isOneToOne: false
            referencedRelation: 'sales'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      pix_charges: {
        Row: {
          id: string
          client_uuid: string
          sale_id: string | null
          amount: number
          provider: string
          provider_charge_id: string | null
          status: 'pending' | 'paid' | 'expired' | 'cancelled'
          qr_code: string | null
          qr_code_base64: string | null
          paid_at: string | null
          expires_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          sale_id?: string | null
          amount: number
          provider: string
          provider_charge_id?: string | null
          status?: 'pending' | 'paid' | 'expired' | 'cancelled'
          qr_code?: string | null
          qr_code_base64?: string | null
          paid_at?: string | null
          expires_at?: string | null
          created_by?: string | null
        }
        Update: {
          status?: 'pending' | 'paid' | 'expired' | 'cancelled'
          sale_id?: string | null
          paid_at?: string | null
        }
        Relationships: []
      }
      sale_returns: {
        Row: {
          id: string
          sale_id: string
          total_amount: number
          refund_method: PaymentMethod
          reason: string
          actor_id: string
          actor_email: string | null
          business_date: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'sale_returns_sale_id_fkey'
            columns: ['sale_id']
            isOneToOne: false
            referencedRelation: 'sales'
            referencedColumns: ['id']
          }
        ]
      }
      sale_return_items: {
        Row: {
          id: string
          return_id: string
          sale_item_id: string
          product_id: string | null
          quantity: number
          unit_price: number
          subtotal: number
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'sale_return_items_return_id_fkey'
            columns: ['return_id']
            isOneToOne: false
            referencedRelation: 'sale_returns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_return_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          }
        ]
      }
      cash_movements: {
        Row: {
          id: string
          business_date: string
          kind: 'opening' | 'in' | 'out'
          amount: number
          reason: string
          actor_id: string
          actor_email: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      cash_closes: {
        Row: {
          id: string
          business_date: string
          expected_cash: number
          counted_cash: number
          difference: number
          notes: string | null
          actor_id: string
          actor_email: string | null
          closed_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          action: string
          entity: string
          entity_id: string | null
          actor_id: string | null
          actor_email: string | null
          summary: string
          reason: string | null
          snapshot: Json
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      sale_payments: {
        Row: {
          id: string
          sale_id: string
          method: PaymentMethod
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          sale_id: string
          method: PaymentMethod
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          sale_id?: string
          method?: PaymentMethod
          amount?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sale_payments_sale_id_fkey'
            columns: ['sale_id']
            isOneToOne: false
            referencedRelation: 'sales'
            referencedColumns: ['id']
          }
        ]
      }
      profiles: {
        Row: {
          user_id: string
          first_name: string | null
          last_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          first_name?: string | null
          last_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          first_name?: string | null
          last_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          user_id: string
          role: UserRole
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_recipients: {
        Row: {
          id: string
          email: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      barcode_cache: {
        Row: {
          code: string
          source: 'cosmos' | 'openfoodfacts' | 'upcitemdb' | 'not_found'
          name: string | null
          description: string | null
          created_at: string
          updated_at: string
          last_accessed_at: string
        }
        Insert: {
          code: string
          source: 'cosmos' | 'openfoodfacts' | 'upcitemdb' | 'not_found'
          name?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
          last_accessed_at?: string
        }
        Update: {
          code?: string
          source?: 'cosmos' | 'openfoodfacts' | 'upcitemdb' | 'not_found'
          name?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
          last_accessed_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      customer_balances: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
          total_fiado: number
          total_paid: number
          current_debt: number
          last_payment_at: string | null
          first_fiado_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      dre_report: {
        Args: { p_start: string; p_end: string }
        Returns: unknown
      }
      dashboard_metrics: {
        Args: Record<string, never>
        Returns: {
          today_total: number
          today_count: number
          yesterday_total: number
          month_total: number
          month_count: number
          last_month_total: number
          avg_ticket: number
          low_stock_count: number
        }[]
      }
      sales_last_30_days: {
        Args: Record<string, never>
        Returns: {
          day_label: string
          total: number
        }[]
      }
      create_sale_with_items: {
        Args: {
          p_payment_method: PaymentMethod
          p_notes: string | null
          p_items: Json
          p_client_uuid?: string | null
          p_customer_id?: string | null
          p_discount?: number
          p_payments?: Json
        }
        Returns: string
      }
      search_customers: {
        Args: { p_query: string }
        Returns: {
          id: string
          full_name: string
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }[]
      }
      record_debt_payment: {
        Args: {
          p_customer_id: string
          p_amount: number
          p_notes?: string | null
        }
        Returns: string
      }
      is_admin: {
        Args: {
          p_user_id?: string
        }
        Returns: boolean
      }
      admin_list_users: {
        Args: Record<string, never>
        Returns: {
          user_id: string
          email: string
          first_name: string | null
          last_name: string | null
          role: UserRole
          created_at: string
          last_sign_in_at: string | null
        }[]
      }
      admin_set_role: {
        Args: {
          p_user_id: string
          p_role: UserRole
        }
        Returns: null
      }
      cash_expected: {
        Args: { p_date: string }
        Returns: {
          opening: number
          cash_sales: number
          supplies: number
          withdrawals: number
          refunds: number
          expected: number
        }[]
      }
      returnable_items: {
        Args: { p_sale_id: string }
        Returns: {
          sale_item_id: string
          product_id: string | null
          product_name: string
          unit_price: number
          sold: number
          returned: number
          remaining: number
        }[]
      }
      register_sale_return: {
        Args: {
          p_sale_id: string
          p_items: Json
          p_refund_method: PaymentMethod
          p_reason: string
        }
        Returns: string
      }
      register_cash_movement: {
        Args: { p_kind: 'opening' | 'in' | 'out'; p_amount: number; p_reason: string }
        Returns: string
      }
      close_cash_register: {
        Args: { p_date: string; p_counted: number; p_notes?: string | null }
        Returns: string
      }
      cancel_sale: {
        Args: {
          p_sale_id: string
          p_reason?: string | null
        }
        Returns: null
      }
      cleanup_barcode_cache: {
        Args: Record<string, never>
        Returns: number
      }
    }
  }
}

export type Category = Database['public']['Tables']['categories']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type Sale = Database['public']['Tables']['sales']['Row']
export type SaleItem = Database['public']['Tables']['sale_items']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type DebtPayment = Database['public']['Tables']['debt_payments']['Row']
export type CustomerBalance = Database['public']['Views']['customer_balances']['Row']

export type ProductWithCategory = Product & {
  categories: Category | null
}

export type SaleWithItems = Sale & {
  sale_items: (SaleItem & { products: Product })[]
  customers: { full_name: string } | null
  /**
   * Como a venda foi efetivamente paga. Uma linha quando a forma é única.
   * Vazio nas vendas de total zero, que não foram pagas em forma nenhuma.
   */
  sale_payments?: { method: PaymentMethod; amount: number }[]
}

export type CartItem = {
  product: Product
  quantity: number
  customPrice?: number
  itemDescription?: string
}
