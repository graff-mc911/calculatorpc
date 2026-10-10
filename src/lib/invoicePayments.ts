import { supabase } from './supabase';

export type InvoicePayment = {
  id: string;
  invoice_id: string;
  user_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  note: string | null;
  created_at: string;
};

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('Not authenticated');
  return user.id;
}

export async function listInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('user_id', uid)
    .order('paid_at', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    amount: Number(row.amount) || 0,
  })) as InvoicePayment[];
}

export async function addInvoicePayment(input: {
  invoice_id: string;
  amount: number;
  currency?: string;
  paid_at?: string;
  note?: string | null;
}): Promise<InvoicePayment> {
  const uid = await requireUserId();
  const amount = Number(input.amount);
  if (!(amount > 0)) throw new Error('INVALID_AMOUNT');

  const { data, error } = await supabase
    .from('invoice_payments')
    .insert({
      user_id: uid,
      invoice_id: input.invoice_id,
      amount,
      currency: input.currency || 'EUR',
      paid_at: input.paid_at || new Date().toISOString().slice(0, 10),
      note: input.note?.trim() || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return { ...data, amount: Number(data.amount) || 0 } as InvoicePayment;
}

export function sumPayments(payments: Array<{ amount?: number | null }>): number {
  return payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

export function remainingBalance(invoiceTotal: number, paidTotal: number): number {
  const rem = Math.round((invoiceTotal - paidTotal) * 100) / 100;
  return rem > 0 ? rem : 0;
}
