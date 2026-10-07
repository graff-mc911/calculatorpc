export type MoneyWorkItem = {
  quantity: number | string | null | undefined;
  unit_price: number | string | null | undefined;
  /** Never use as source of truth for calcs — prefer quantity * unit_price. */
  totalPrice?: number | string | null | undefined;
};

export type MoneyAmount = {
  amount: number | string | null | undefined;
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

/**
 * All money totals derive from quantity * unit_price (never stored totalPrice).
 */
export function computeProjectMetrics(
  workItems: MoneyWorkItem[],
  expenses: MoneyAmount[],
  prepayments: MoneyAmount[],
  expenseBudget = 0
): ProjectMetrics {
  const estimateTotal = workItems.reduce(
    (sum, w) => sum + n(w.quantity) * n(w.unit_price),
    0
  );
  const received = prepayments.reduce((sum, p) => sum + n(p.amount), 0);
  const expensesTotal = expenses.reduce((sum, e) => sum + n(e.amount), 0);
  const balanceDue = Math.max(0, estimateTotal - received);
  const overpayment = Math.max(0, received - estimateTotal);
  const projectedProfit = estimateTotal - expensesTotal;
  const marginPct = estimateTotal > 0 ? (projectedProfit / estimateTotal) * 100 : 0;
  const budgetBase = expenseBudget > 0 ? expenseBudget : estimateTotal;
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
    expenseBudget: expenseBudget > 0 ? expenseBudget : 0,
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
