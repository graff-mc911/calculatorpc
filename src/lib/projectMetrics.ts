export type MoneyWorkItem = {
  quantity: number | string | null | undefined;
  unit_price: number | string | null | undefined;
};

export type MoneyAmount = {
  amount: number | string | null | undefined;
};

export type ProjectMetrics = {
  estimateTotal: number;
  received: number;
  balanceDue: number;
  expenses: number;
  projectedProfit: number;
  marginPct: number;
  expenseBudget: number;
  expenseProgress: number; // 0..1+
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

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
  const projectedProfit = estimateTotal - expensesTotal;
  const marginPct = estimateTotal > 0 ? (projectedProfit / estimateTotal) * 100 : 0;
  const budgetBase = expenseBudget > 0 ? expenseBudget : estimateTotal;
  const expenseProgress = budgetBase > 0 ? expensesTotal / budgetBase : expensesTotal > 0 ? 1 : 0;

  return {
    estimateTotal,
    received,
    balanceDue,
    expenses: expensesTotal,
    projectedProfit,
    marginPct,
    expenseBudget: expenseBudget > 0 ? expenseBudget : 0,
    expenseProgress,
  };
}

export function lineTotal(quantity: unknown, unitPrice: unknown): number {
  return n(quantity) * n(unitPrice);
}
