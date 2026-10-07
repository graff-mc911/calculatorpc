/**
 * Sanity check for project estimator metrics + money masks.
 * Run: npx tsx scripts/verify-project-metrics.mts
 */
import { computeProjectMetrics, lineTotal } from '../src/lib/projectMetrics.ts';
import {
  parseMoneyInput,
  formatMoneyInput,
  formatMoneyDisplay,
  formatCurrency,
  maskMoneyTyping,
  maskQtyTyping,
  formatQtyDisplay,
} from '../src/lib/moneyMask.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const NBSP = '\u00A0';

const metrics = computeProjectMetrics(
  [
    { quantity: 10, unit_price: 45 },
    { quantity: 2, unit_price: 100 },
  ],
  [{ amount: 150 }, { amount: 50 }],
  [{ amount: 200 }],
  500
);

assert(metrics.estimateTotal === 650, `estimate ${metrics.estimateTotal}`);
assert(metrics.received === 200, `received ${metrics.received}`);
assert(metrics.balanceDue === 450, `balance ${metrics.balanceDue}`);
assert(metrics.overpayment === 0, `overpayment ${metrics.overpayment}`);
assert(metrics.expenses === 200, `expenses ${metrics.expenses}`);
assert(metrics.projectedProfit === 450, `profit ${metrics.projectedProfit}`);
assert(Math.abs(metrics.marginPct - (450 / 650) * 100) < 0.01, `margin ${metrics.marginPct}`);
assert(metrics.expenseProgressCapped <= 1, 'progress capped');
assert(metrics.budgetExceeded === false, 'not exceeded');
assert(lineTotal(3, 12.5) === 37.5, 'lineTotal');

// Never trust totalPrice field
const ignoreTotal = computeProjectMetrics(
  [{ quantity: 2, unit_price: 10, totalPrice: 9999 }],
  [],
  [],
  0
);
assert(ignoreTotal.estimateTotal === 20, `qty*price not totalPrice ${ignoreTotal.estimateTotal}`);

// Overpayment when prepayments > estimate
const over = computeProjectMetrics(
  [{ quantity: 1, unit_price: 100 }],
  [{ amount: 150 }],
  [{ amount: 180 }],
  100
);
assert(over.balanceDue === 0, `over balance ${over.balanceDue}`);
assert(over.overpayment === 80, `over ${over.overpayment}`);
assert(over.budgetExceeded === true, 'budget exceeded');
assert(over.expenseProgressCapped === 1, `cap ${over.expenseProgressCapped}`);
assert(over.expenseProgress === 1.5, `raw progress ${over.expenseProgress}`);

// NaN guards
const nanSafe = computeProjectMetrics(
  [{ quantity: 'x', unit_price: null }],
  [{ amount: undefined }],
  [{ amount: 'bad' }],
  NaN
);
assert(nanSafe.estimateTotal === 0, 'nan estimate');
assert(nanSafe.received === 0, 'nan received');
assert(Number.isFinite(nanSafe.marginPct), 'margin finite');

assert(parseMoneyInput('1 500,00') === 1500, 'parse spaces');
assert(parseMoneyInput(`1${NBSP}500,50`) === 1500.5, 'parse nbsp');
assert(parseMoneyInput('1.234,56') === 1234.56, 'parse dots');
assert(formatMoneyInput(1500) === `1${NBSP}500,00`, `format ${formatMoneyInput(1500)}`);
assert(
  formatMoneyDisplay(1500, 'EUR') === `1${NBSP}500,00${NBSP}€`,
  `display ${formatMoneyDisplay(1500, 'EUR')}`
);
assert(formatCurrency(NaN, 'EUR') === `0,00${NBSP}€`, 'formatCurrency NaN');
assert(formatCurrency(null, 'EUR') === `0,00${NBSP}€`, 'formatCurrency null');
assert(maskMoneyTyping('1500') === `1${NBSP}500`, `mask ${maskMoneyTyping('1500')}`);
assert(maskMoneyTyping('1500,5') === `1${NBSP}500,5`, 'mask decimal');
assert(maskQtyTyping('12,5') === '12,5', 'qty mask');
assert(formatQtyDisplay(12.5) === '12,5', `qty fmt ${formatQtyDisplay(12.5)}`);

console.log('verify-project-metrics: OK');
