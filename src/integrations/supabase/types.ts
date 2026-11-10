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
      analyses: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          end_fy: number | null
          id: string
          is_shared: boolean
          reporting_basis: Database["public"]["Enums"]["reporting_basis"]
          stage: Database["public"]["Enums"]["analysis_stage"]
          start_fy: number | null
          status: Database["public"]["Enums"]["processing_status"]
          title: string
          units: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          end_fy?: number | null
          id?: string
          is_shared?: boolean
          reporting_basis?: Database["public"]["Enums"]["reporting_basis"]
          stage?: Database["public"]["Enums"]["analysis_stage"]
          start_fy?: number | null
          status?: Database["public"]["Enums"]["processing_status"]
          title: string
          units?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          end_fy?: number | null
          id?: string
          is_shared?: boolean
          reporting_basis?: Database["public"]["Enums"]["reporting_basis"]
          stage?: Database["public"]["Enums"]["analysis_stage"]
          start_fy?: number | null
          status?: Database["public"]["Enums"]["processing_status"]
          title?: string
          units?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_sheets: {
        Row: {
          analysis_id: string
          average_capital_employed: number | null
          average_equity: number | null
          cash_and_equivalents: number | null
          created_at: string
          current_assets: number | null
          current_liabilities: number | null
          cwip: number | null
          fixed_assets: number | null
          id: string
          inventories: number | null
          investments: number | null
          is_user_corrected: boolean
          long_term_borrowings: number | null
          minority_interest: number | null
          other_assets: number | null
          other_liabilities: number | null
          period_id: string
          reserves: number | null
          share_capital: number | null
          shares_outstanding: number | null
          short_term_borrowings: number | null
          source_document_id: string | null
          total_assets: number | null
          total_debt: number | null
          total_equity: number | null
          total_liabilities: number | null
          trade_payables: number | null
          trade_receivables: number | null
        }
        Insert: {
          analysis_id: string
          average_capital_employed?: number | null
          average_equity?: number | null
          cash_and_equivalents?: number | null
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          cwip?: number | null
          fixed_assets?: number | null
          id?: string
          inventories?: number | null
          investments?: number | null
          is_user_corrected?: boolean
          long_term_borrowings?: number | null
          minority_interest?: number | null
          other_assets?: number | null
          other_liabilities?: number | null
          period_id: string
          reserves?: number | null
          share_capital?: number | null
          shares_outstanding?: number | null
          short_term_borrowings?: number | null
          source_document_id?: string | null
          total_assets?: number | null
          total_debt?: number | null
          total_equity?: number | null
          total_liabilities?: number | null
          trade_payables?: number | null
          trade_receivables?: number | null
        }
        Update: {
          analysis_id?: string
          average_capital_employed?: number | null
          average_equity?: number | null
          cash_and_equivalents?: number | null
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          cwip?: number | null
          fixed_assets?: number | null
          id?: string
          inventories?: number | null
          investments?: number | null
          is_user_corrected?: boolean
          long_term_borrowings?: number | null
          minority_interest?: number | null
          other_assets?: number | null
          other_liabilities?: number | null
          period_id?: string
          reserves?: number | null
          share_capital?: number | null
          shares_outstanding?: number | null
          short_term_borrowings?: number | null
          source_document_id?: string | null
          total_assets?: number | null
          total_debt?: number | null
          total_equity?: number | null
          total_liabilities?: number | null
          trade_payables?: number | null
          trade_receivables?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_sheets_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_sheets_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_sheets_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "uploaded_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_statements: {
        Row: {
          analysis_id: string
          capex: number | null
          cash_from_financing: number | null
          cash_from_investing: number | null
          cash_from_operations: number | null
          created_at: string
          dividends_paid: number | null
          free_cash_flow: number | null
          id: string
          is_user_corrected: boolean
          net_change_in_cash: number | null
          period_id: string
          source_document_id: string | null
        }
        Insert: {
          analysis_id: string
          capex?: number | null
          cash_from_financing?: number | null
          cash_from_investing?: number | null
          cash_from_operations?: number | null
          created_at?: string
          dividends_paid?: number | null
          free_cash_flow?: number | null
          id?: string
          is_user_corrected?: boolean
          net_change_in_cash?: number | null
          period_id: string
          source_document_id?: string | null
        }
        Update: {
          analysis_id?: string
          capex?: number | null
          cash_from_financing?: number | null
          cash_from_investing?: number | null
          cash_from_operations?: number | null
          created_at?: string
          dividends_paid?: number | null
          free_cash_flow?: number | null
          id?: string
          is_user_corrected?: boolean
          net_change_in_cash?: number | null
          period_id?: string
          source_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_statements_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_statements_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_statements_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "uploaded_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          bse_code: string | null
          country: string
          created_at: string
          created_by: string | null
          currency: string
          exchange: Database["public"]["Enums"]["exchange_code"]
          fy_end_month: number
          id: string
          industry: string | null
          isin: string | null
          name: string
          nse_symbol: string | null
          sector: string | null
          source: string
        }
        Insert: {
          bse_code?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange?: Database["public"]["Enums"]["exchange_code"]
          fy_end_month?: number
          id?: string
          industry?: string | null
          isin?: string | null
          name: string
          nse_symbol?: string | null
          sector?: string | null
          source?: string
        }
        Update: {
          bse_code?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange?: Database["public"]["Enums"]["exchange_code"]
          fy_end_month?: number
          id?: string
          industry?: string | null
          isin?: string | null
          name?: string
          nse_symbol?: string | null
          sector?: string | null
          source?: string
        }
        Relationships: []
      }
      data_validation_results: {
        Row: {
          analysis_id: string
          created_at: string
          fiscal_year: number | null
          id: string
          message: string
          passed: boolean
          rule_key: string
          severity: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          fiscal_year?: number | null
          id?: string
          message: string
          passed: boolean
          rule_key: string
          severity: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          fiscal_year?: number | null
          id?: string
          message?: string
          passed?: boolean
          rule_key?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_validation_results_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_financial_metrics: {
        Row: {
          analysis_id: string
          confidence: number | null
          created_at: string
          document_id: string | null
          fiscal_year: number
          flags: string[]
          id: string
          is_user_corrected: boolean
          metric_key: string
          normalized_value: number | null
          original_value: number | null
          page_ref: string | null
          raw_label: string | null
          review_status: string
          reviewed_at: string | null
          source_unit: string | null
          statement: string
          value: number | null
        }
        Insert: {
          analysis_id: string
          confidence?: number | null
          created_at?: string
          document_id?: string | null
          fiscal_year: number
          flags?: string[]
          id?: string
          is_user_corrected?: boolean
          metric_key: string
          normalized_value?: number | null
          original_value?: number | null
          page_ref?: string | null
          raw_label?: string | null
          review_status?: string
          reviewed_at?: string | null
          source_unit?: string | null
          statement?: string
          value?: number | null
        }
        Update: {
          analysis_id?: string
          confidence?: number | null
          created_at?: string
          document_id?: string | null
          fiscal_year?: number
          flags?: string[]
          id?: string
          is_user_corrected?: boolean
          metric_key?: string
          normalized_value?: number | null
          original_value?: number | null
          page_ref?: string | null
          raw_label?: string | null
          review_status?: string
          reviewed_at?: string | null
          source_unit?: string | null
          statement?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_financial_metrics_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_financial_metrics_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "uploaded_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          analysis_id: string
          created_at: string
          currency: string
          fiscal_year: number
          id: string
          period_end: string | null
          period_label: string
          period_start: string | null
          reporting_basis: Database["public"]["Enums"]["reporting_basis"]
          source_document_id: string | null
          units: string
          validation_status: Database["public"]["Enums"]["processing_status"]
        }
        Insert: {
          analysis_id: string
          created_at?: string
          currency?: string
          fiscal_year: number
          id?: string
          period_end?: string | null
          period_label: string
          period_start?: string | null
          reporting_basis: Database["public"]["Enums"]["reporting_basis"]
          source_document_id?: string | null
          units?: string
          validation_status?: Database["public"]["Enums"]["processing_status"]
        }
        Update: {
          analysis_id?: string
          created_at?: string
          currency?: string
          fiscal_year?: number
          id?: string
          period_end?: string | null
          period_label?: string
          period_start?: string | null
          reporting_basis?: Database["public"]["Enums"]["reporting_basis"]
          source_document_id?: string | null
          units?: string
          validation_status?: Database["public"]["Enums"]["processing_status"]
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_periods_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "uploaded_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_ratios: {
        Row: {
          analysis_id: string
          category: string
          created_at: string
          fiscal_year: number
          formula: string | null
          id: string
          ratio_key: string
          value: number | null
        }
        Insert: {
          analysis_id: string
          category: string
          created_at?: string
          fiscal_year: number
          formula?: string | null
          id?: string
          ratio_key: string
          value?: number | null
        }
        Update: {
          analysis_id?: string
          category?: string
          created_at?: string
          fiscal_year?: number
          formula?: string | null
          id?: string
          ratio_key?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_ratios_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          analysis_id: string
          created_at: string
          error: string | null
          id: string
          report_type: string
          status: Database["public"]["Enums"]["processing_status"]
          storage_path: string | null
          user_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          error?: string | null
          id?: string
          report_type: string
          status?: Database["public"]["Enums"]["processing_status"]
          storage_path?: string | null
          user_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          error?: string | null
          id?: string
          report_type?: string
          status?: Database["public"]["Enums"]["processing_status"]
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      income_statements: {
        Row: {
          analysis_id: string
          cost_of_materials: number | null
          created_at: string
          depreciation: number | null
          ebit: number | null
          ebitda: number | null
          employee_expenses: number | null
          eps_basic: number | null
          eps_diluted: number | null
          exceptional_items: number | null
          finance_costs: number | null
          id: string
          is_user_corrected: boolean
          minority_interest: number | null
          net_profit: number | null
          other_expenses: number | null
          other_income: number | null
          period_id: string
          profit_before_tax: number | null
          revenue: number | null
          source_document_id: string | null
          tax_expense: number | null
          total_income: number | null
        }
        Insert: {
          analysis_id: string
          cost_of_materials?: number | null
          created_at?: string
          depreciation?: number | null
          ebit?: number | null
          ebitda?: number | null
          employee_expenses?: number | null
          eps_basic?: number | null
          eps_diluted?: number | null
          exceptional_items?: number | null
          finance_costs?: number | null
          id?: string
          is_user_corrected?: boolean
          minority_interest?: number | null
          net_profit?: number | null
          other_expenses?: number | null
          other_income?: number | null
          period_id: string
          profit_before_tax?: number | null
          revenue?: number | null
          source_document_id?: string | null
          tax_expense?: number | null
          total_income?: number | null
        }
        Update: {
          analysis_id?: string
          cost_of_materials?: number | null
          created_at?: string
          depreciation?: number | null
          ebit?: number | null
          ebitda?: number | null
          employee_expenses?: number | null
          eps_basic?: number | null
          eps_diluted?: number | null
          exceptional_items?: number | null
          finance_costs?: number | null
          id?: string
          is_user_corrected?: boolean
          minority_interest?: number | null
          net_profit?: number | null
          other_expenses?: number | null
          other_income?: number | null
          period_id?: string
          profit_before_tax?: number | null
          revenue?: number | null
          source_document_id?: string | null
          tax_expense?: number | null
          total_income?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "income_statements_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_statements_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_statements_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "uploaded_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_theses: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          model_used: string | null
          recommendation: string | null
          summary: string | null
          target_price: number | null
          thesis: Json
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          model_used?: string | null
          recommendation?: string | null
          summary?: string | null
          target_price?: number | null
          thesis?: Json
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          model_used?: string | null
          recommendation?: string | null
          summary?: string | null
          target_price?: number | null
          thesis?: Json
        }
        Relationships: [
          {
            foreignKeyName: "investment_theses_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          organisation: string | null
          updated_at: string
          user_type: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          organisation?: string | null
          updated_at?: string
          user_type?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          organisation?: string | null
          updated_at?: string
          user_type?: string | null
        }
        Relationships: []
      }
      research_sources: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          published_at: string | null
          publisher: string | null
          source_type: string
          title: string
          url: string | null
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          source_type: string
          title: string
          url?: string | null
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          source_type?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_sources_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_documents: {
        Row: {
          analysis_id: string
          created_at: string
          detected_basis: Database["public"]["Enums"]["reporting_basis"] | null
          detected_currency: string | null
          detected_fiscal_years: number[]
          detected_units: string | null
          extracted_at: string | null
          extraction_error: string | null
          extraction_method: string | null
          extraction_status: Database["public"]["Enums"]["processing_status"]
          file_name: string
          fiscal_year: number
          id: string
          mime_type: string | null
          page_count: number | null
          reporting_basis: Database["public"]["Enums"]["reporting_basis"]
          size_bytes: number | null
          statement_type: Database["public"]["Enums"]["statement_type"]
          storage_path: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          detected_basis?: Database["public"]["Enums"]["reporting_basis"] | null
          detected_currency?: string | null
          detected_fiscal_years?: number[]
          detected_units?: string | null
          extracted_at?: string | null
          extraction_error?: string | null
          extraction_method?: string | null
          extraction_status?: Database["public"]["Enums"]["processing_status"]
          file_name: string
          fiscal_year: number
          id?: string
          mime_type?: string | null
          page_count?: number | null
          reporting_basis: Database["public"]["Enums"]["reporting_basis"]
          size_bytes?: number | null
          statement_type: Database["public"]["Enums"]["statement_type"]
          storage_path: string
          user_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          detected_basis?: Database["public"]["Enums"]["reporting_basis"] | null
          detected_currency?: string | null
          detected_fiscal_years?: number[]
          detected_units?: string | null
          extracted_at?: string | null
          extraction_error?: string | null
          extraction_method?: string | null
          extraction_status?: Database["public"]["Enums"]["processing_status"]
          file_name?: string
          fiscal_year?: number
          id?: string
          mime_type?: string | null
          page_count?: number | null
          reporting_basis?: Database["public"]["Enums"]["reporting_basis"]
          size_bytes?: number | null
          statement_type?: Database["public"]["Enums"]["statement_type"]
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_documents_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_assumptions: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          key: string
          method: string
          rationale: string | null
          source: string | null
          value: number | null
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          key: string
          method: string
          rationale?: string | null
          source?: string | null
          value?: number | null
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          key?: string
          method?: string
          rationale?: string | null
          source?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "valuation_assumptions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_results: {
        Row: {
          analysis_id: string
          base_value: number | null
          bear_value: number | null
          bull_value: number | null
          created_at: string
          details: Json
          id: string
          intrinsic_value_per_share: number | null
          market_price: number | null
          market_price_as_of: string | null
          market_price_source: string | null
          method: string
        }
        Insert: {
          analysis_id: string
          base_value?: number | null
          bear_value?: number | null
          bull_value?: number | null
          created_at?: string
          details?: Json
          id?: string
          intrinsic_value_per_share?: number | null
          market_price?: number | null
          market_price_as_of?: string | null
          market_price_source?: string | null
          method: string
        }
        Update: {
          analysis_id?: string
          base_value?: number | null
          bear_value?: number | null
          bull_value?: number | null
          created_at?: string
          details?: Json
          id?: string
          intrinsic_value_per_share?: number | null
          market_price?: number | null
          market_price_as_of?: string | null
          market_price_source?: string | null
          method?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuation_results_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_analysis: { Args: { _analysis_id: string }; Returns: boolean }
      owns_analysis: { Args: { _analysis_id: string }; Returns: boolean }
    }
    Enums: {
      analysis_stage:
        | "company_selected"
        | "documents_uploaded"
        | "extracted"
        | "validated"
        | "analysed"
        | "researched"
        | "valued"
        | "thesis_generated"
        | "deck_generated"
      exchange_code: "NSE" | "BSE" | "BOTH"
      processing_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "not_configured"
      reporting_basis: "consolidated" | "standalone"
      statement_type:
        | "income_statement"
        | "balance_sheet"
        | "cash_flow"
        | "annual_report"
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
      analysis_stage: [
        "company_selected",
        "documents_uploaded",
        "extracted",
        "validated",
        "analysed",
        "researched",
        "valued",
        "thesis_generated",
        "deck_generated",
      ],
      exchange_code: ["NSE", "BSE", "BOTH"],
      processing_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "not_configured",
      ],
      reporting_basis: ["consolidated", "standalone"],
      statement_type: [
        "income_statement",
        "balance_sheet",
        "cash_flow",
        "annual_report",
        "other",
      ],
    },
  },
} as const
