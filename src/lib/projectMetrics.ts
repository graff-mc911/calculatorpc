export type MoneyWorkItem = {
  quantity: number | string | null | undefined;
  unit_price: number | string | null | undefined;
  /** Never use as source of truth for calcs — prefer quantity * unit_price. */
  totalPrice?: number | string | null | undefined;
};

export type MoneyAmount = {
  amount: number | string | null | undefined;
};

/** Linked invoice money used when work-sheet estimate is empty or for received. */
export type ProjectInvoiceMoney = {
  total_gross?: number | string | null;
  status?: string | null;
  /** Sum of invoice_payments for this invoice; omit if unknown. */
  paid_amount?: number | string | null;
};

export type ProjectMetrics = {
  estimateTotal: number;
  received: number;
  balanceDue: number;
  /** Positive when prepayments exceed estimate; shown separately from balanceDue. */
  overpayment: number;
  expenses: number;
  projectedProfit: number;
  marginPct: number;
  expenseBudget: number;
  /** Raw ratio expenses / budgetBase (may be > 1). */
  expenseProgress: number;
  /** 0..1 for UI bar width. */
  expenseProgressCapped: number;
  /** True when expenses exceed budget base (budget or estimate). */
  budgetExceeded: boolean;
  budgetBase: number;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function invoicePaidAmount(inv: ProjectInvoiceMoney): number {
  const gross = n(inv.total_gross);
  const paid =
    inv.paid_amount === null || inv.paid_amount === undefined
      ? null
      : n(inv.paid_amount);
  if (String(inv.status || '').toLowerCase() === 'paid') {
    return Math.max(paid ?? 0, gross);
  }
  return paid ?? 0;
}

/**
 * All money totals derive from quantity * unit_price (never stored totalPrice).
 * When work items are empty, estimate falls back to linked invoice totals, then expense_budget.
 * Received = project prepayments + invoice payments (paid invoices count as fully received).
 */
export function computeProjectMetrics(
  workItems: MoneyWorkItem[],
  expenses: MoneyAmount[],
  prepayments: MoneyAmount[],
  expenseBudget = 0,
  invoices: ProjectInvoiceMoney[] = []
): ProjectMetrics {
  const workTotal = workItems.reduce(
    (sum, w) => sum + n(w.quantity) * n(w.unit_price),
    0
  );
  const invoiceTotal = invoices.reduce((sum, inv) => sum + n(inv.total_gross), 0);
  const budget = n(expenseBudget);

  // Prefer sheet estimate; else billed invoices; else stored object price / budget.
  const estimateTotal =
    workTotal > 0 ? workTotal : invoiceTotal > 0 ? invoiceTotal : budget;

  const prepaymentReceived = prepayments.reduce((sum, p) => sum + n(p.amount), 0);
  const invoiceReceived = invoices.reduce((sum, inv) => sum + invoicePaidAmount(inv), 0);
  const received = prepaymentReceived + invoiceReceived;

  const expensesTotal = expenses.reduce((sum, e) => sum + n(e.amount), 0);
  const balanceDue = Math.max(0, estimateTotal - received);
  const overpayment = Math.max(0, received - estimateTotal);
  const projectedProfit = estimateTotal - expensesTotal;
  const marginPct = estimateTotal > 0 ? (projectedProfit / estimateTotal) * 100 : 0;
  const budgetBase = budget > 0 ? budget : estimateTotal;
  const expenseProgress =
    budgetBase > 0 ? expensesTotal / budgetBase : expensesTotal > 0 ? 1 : 0;
  const expenseProgressCapped = Math.min(1, Math.max(0, expenseProgress));
  const budgetExceeded = budgetBase > 0 && expensesTotal > budgetBase;

  return {
    estimateTotal,
    received,
    balanceDue,
    overpayment,
    expenses: expensesTotal,
    projectedProfit,
    marginPct,
    expenseBudget: budget > 0 ? budget : 0,
    expenseProgress,
    expenseProgressCapped,
    budgetExceeded,
    budgetBase,
  };
}

export function lineTotal(quantity: unknown, unitPrice: unknown): number {
  return n(quantity) * n(unitPrice);
}

/** Safe number for UI — never returns NaN. */
export function safeMoney(v: unknown): number {
  return n(v);
}
