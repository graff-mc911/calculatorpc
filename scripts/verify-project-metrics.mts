/**
 * Quick sanity check for project estimator metrics.
 * Run: npx tsx scripts/verify-project-metrics.mts
 */
import { computeProjectMetrics, lineTotal } from '../src/lib/projectMetrics.ts';
import { parseMoneyInput, formatMoneyInput, maskMoneyTyping } from '../src/lib/moneyMask.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

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
assert(metrics.expenseProgress === 200 / 500, `progress ${metrics.expenseProgress}`);
assert(lineTotal(3, 12.5) === 37.5, 'lineTotal');

assert(parseMoneyInput('1.234,56') === 1234.56, 'parse eu');
assert(parseMoneyInput('12,5') === 12.5, 'parse comma');
assert(formatMoneyInput(1234.5) === '1.234,50', `format ${formatMoneyInput(1234.5)}`);
assert(maskMoneyTyping('12,345') === '12,34', `mask ${maskMoneyTyping('12,345')}`);

console.log('verify-project-metrics: OK');
