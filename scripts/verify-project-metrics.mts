/**
 * Sanity check for project estimator metrics + money masks.
 * Run: npx tsx scripts/verify-project-metrics.mts
 */
import { computeProjectMetrics, lineTotal } from '../src/lib/projectMetrics.ts';
import {
  parseMoneyInput,
  formatMoneyInput,
  formatMoneyDisplay,
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
assert(metrics.expenses === 200, `expenses ${metrics.expenses}`);
assert(metrics.projectedProfit === 450, `profit ${metrics.projectedProfit}`);
assert(Math.abs(metrics.marginPct - (450 / 650) * 100) < 0.01, `margin ${metrics.marginPct}`);
assert(lineTotal(3, 12.5) === 37.5, 'lineTotal');

assert(parseMoneyInput('1 500,00') === 1500, 'parse spaces');
assert(parseMoneyInput(`1${NBSP}500,50`) === 1500.5, 'parse nbsp');
assert(parseMoneyInput('1.234,56') === 1234.56, 'parse dots');
assert(formatMoneyInput(1500) === `1${NBSP}500,00`, `format ${formatMoneyInput(1500)}`);
assert(
  formatMoneyDisplay(1500, 'EUR') === `1${NBSP}500,00${NBSP}€`,
  `display ${formatMoneyDisplay(1500, 'EUR')}`
);
assert(maskMoneyTyping('1500') === `1${NBSP}500`, `mask ${maskMoneyTyping('1500')}`);
assert(maskMoneyTyping('1500,5') === `1${NBSP}500,5`, 'mask decimal');
assert(maskQtyTyping('12,5') === '12,5', 'qty mask');
assert(formatQtyDisplay(12.5) === '12,5', `qty fmt ${formatQtyDisplay(12.5)}`);

console.log('verify-project-metrics: OK');
