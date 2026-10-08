/**
 * Field categories for builders — keep the list short.
 * Older receipt categories map via aliases so existing rows still display.
 */
export const EXPENSE_CATEGORIES = [
  'materials',
  'salary',
  'transport',
  'tools',
  'subcontractor',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Ukrainian labels for on-site UI (primary locale for field pages). */
export const EXPENSE_CATEGORY_LABELS_UK: Record<ExpenseCategory, string> = {
  materials: 'Матеріали',
  salary: 'Зарплата',
  transport: 'Транспорт',
  tools: 'Інструмент',
  subcontractor: 'Субпідрядник',
  other: 'Інше',
};

export function normalizeExpenseCategory(raw: unknown): ExpenseCategory {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  const aliases: Record<string, ExpenseCategory> = {
    materials: 'materials',
    material: 'materials',
    construction: 'materials',
    salary: 'salary',
    labor: 'salary',
    wages: 'salary',
    payroll: 'salary',
    transport: 'transport',
    auto: 'transport',
    car: 'transport',
    fuel: 'transport',
    gas: 'transport',
    travel: 'transport',
    tools: 'tools',
    tool: 'tools',
    instrument: 'tools',
    instruments: 'tools',
    equipment: 'tools',
    subcontractor: 'subcontractor',
    sub: 'subcontractor',
    contractor: 'subcontractor',
    other: 'other',
    food: 'other',
    groceries: 'other',
    restaurant: 'other',
    cafe: 'other',
    entertainment: 'other',
    leisure: 'other',
    utilities: 'other',
    bills: 'other',
    health: 'other',
    medical: 'other',
    pharmacy: 'other',
    hotel: 'other',
    office: 'other',
    supplies: 'other',
    rent: 'other',
  };

  if ((EXPENSE_CATEGORIES as readonly string[]).includes(value)) {
    return value as ExpenseCategory;
  }
  return aliases[value] || 'other';
}

export function categoryI18nKey(category: string): string {
  return `expenseCat_${normalizeExpenseCategory(category)}`;
}

export function categoryLabelUk(category: string): string {
  return EXPENSE_CATEGORY_LABELS_UK[normalizeExpenseCategory(category)];
}
