import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          user_id: string;
          client_id: string | null;
          document_number: string;
          date: string;
          currency: string;
          status: string;
          net_total: number;
          vat_enabled: boolean;
          vat_rate: number;
          vat_amount: number;
          gross_total: number;
          project_area: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id?: string | null;
          document_number: string;
          date?: string;
          currency?: string;
          status?: string;
          net_total?: number;
          vat_enabled?: boolean;
          vat_rate?: number;
          vat_amount?: number;
          gross_total?: number;
          project_area?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string | null;
          document_number?: string;
          date?: string;
          currency?: string;
          status?: string;
          net_total?: number;
          vat_enabled?: boolean;
          vat_rate?: number;
          vat_amount?: number;
          gross_total?: number;
          project_area?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          quantity: number;
          unit: string;
          price: number;
          material: string | null;
          description: string | null;
          total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          quantity: number;
          unit?: string;
          price: number;
          material?: string | null;
          description?: string | null;
          total?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          quantity?: number;
          unit?: string;
          price?: number;
          material?: string | null;
          description?: string | null;
          total?: number;
          created_at?: string;
        };
      };
      company_profile: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          logo_url: string;
          logo_path: string;
          signature_url: string;
          signature_path: string;
          address: string;
          phone: string;
          email: string;
          bank_name: string;
          iban: string;
          bic: string;
          tax_number: string;
          google_client_ids: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name?: string;
          logo_url?: string;
          logo_path?: string;
          signature_url?: string;
          signature_path?: string;
          address?: string;
          phone?: string;
          email?: string;
          bank_name?: string;
          iban?: string;
          bic?: string;
          tax_number?: string;
          google_client_ids?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string;
          logo_url?: string;
          logo_path?: string;
          signature_url?: string;
          signature_path?: string;
          address?: string;
          phone?: string;
          email?: string;
          bank_name?: string;
          iban?: string;
          bic?: string;
          tax_number?: string;
          google_client_ids?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
