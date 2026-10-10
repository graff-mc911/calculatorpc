import { fromCents, parseLocaleNumber, roundMoney, toCents } from './localeNumber';

export { roundMoney, toCents, fromCents };

/** Parse material cost from a line-item material field (numeric text or number). */
export function parseMaterialAmount(material: string | number | null | undefined): number {
  if (typeof material === 'number') {
    return Number.isFinite(material) ? material : 0;
  }

  if (material == null) return 0;

  return parseLocaleNumber(material).value;
}

/** Line total = quantity × price + material cost (form / storage), rounded to cents. */
export function calculateLineTotal(
  quantity: number | string | null | undefined,
  price: number | string | null | undefined,
  material: string | number | null | undefined
): number {
  const qty = Number(quantity) || 0;
  const unitPrice = Number(price) || 0;
  const mat = parseMaterialAmount(material);
  // Exact cents: avoids 9.95*27 → 268.649999…
  return fromCents(toCents(qty * unitPrice) + toCents(mat));
}

export function calculateItemsNetTotal(
  items: Array<{ total?: number | null; quantity?: number; price?: number; material?: string | number | null }>
): number {
  return items.reduce((sum, item) => {
    if (item.total != null && Number.isFinite(Number(item.total))) {
      return sum + Number(item.total);
    }
    return sum + calculateLineTotal(item.quantity, item.price, item.material);
  }, 0);
}

export type InvoiceTableItem = {
  description: string;
  material?: string | number;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  is_section?: boolean;
  /** True when this row was expanded from a line-item material field */
  is_material_row?: boolean;
};

function isSectionRow(item: {
  description?: string;
  quantity?: number;
  price?: number;
  total?: number;
  is_section?: boolean;
}): boolean {
  if (item.is_section) return true;
  const qty = Number(item.quantity) || 0;
  const price = Number(item.price) || 0;
  const total = Number(item.total) || 0;
  return !!item.description?.trim() && qty === 0 && price === 0 && total === 0;
}

/**
 * Expand stored line items into Lexware-style table rows:
 * material becomes its own Pos (1 × Pauschal × amount), then the work line
 * (qty × price) without material folded into Gesamt.
 */
export function expandItemsForInvoiceTable(
  items: Array<{
    description?: string;
    material?: string | number | null;
    quantity?: number | string | null;
    unit?: string | null;
    price?: number | string | null;
    total?: number | null;
    is_section?: boolean;
  }>,
  options: { materialLabel: string; pauschalUnit?: string }
): InvoiceTableItem[] {
  const materialLabel = options.materialLabel || 'Material';
  const pauschalUnit = options.pauschalUnit || 'Pauschal';
  const rows: InvoiceTableItem[] = [];

  for (const item of items) {
    if (isSectionRow(item)) {
      rows.push({
        description: item.description || '',
        quantity: 0,
        unit: '',
        price: 0,
        total: 0,
        is_section: true,
      });
      continue;
    }

    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.price) || 0;
    const materialAmount = parseMaterialAmount(item.material);
    const laborTotal = calculateLineTotal(qty, unitPrice, 0);

    // Lexware order: Material position first, then Arbeit
    if (materialAmount !== 0) {
      rows.push({
        description: materialLabel,
        quantity: 1,
        unit: pauschalUnit,
        price: materialAmount,
        total: materialAmount,
        is_material_row: true,
      });
    }

    rows.push({
      description: item.description || '',
      quantity: qty,
      unit: item.unit || '',
      price: unitPrice,
      total: laborTotal,
      material: '',
    });
  }

  return rows;
}
