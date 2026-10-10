/*
  # Invoice installment payments

  Stores full and partial payments against an invoice.
  Remaining balance = invoice.total_gross − SUM(invoice_payments.amount).
*/

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR',
  paid_at date NOT NULL DEFAULT (CURRENT_DATE),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_date_idx
  ON public.invoice_payments (invoice_id, paid_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS invoice_payments_user_idx
  ON public.invoice_payments (user_id);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_payments_select ON public.invoice_payments;
CREATE POLICY invoice_payments_select
  ON public.invoice_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS invoice_payments_insert ON public.invoice_payments;
CREATE POLICY invoice_payments_insert
  ON public.invoice_payments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id AND i.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS invoice_payments_update ON public.invoice_payments;
CREATE POLICY invoice_payments_update
  ON public.invoice_payments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS invoice_payments_delete ON public.invoice_payments;
CREATE POLICY invoice_payments_delete
  ON public.invoice_payments FOR DELETE TO authenticated
  USING (user_id = auth.uid());
