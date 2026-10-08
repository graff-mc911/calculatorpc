/**
 * Popular + user-saved quick templates for the field Calculator.
 * Custom templates live in localStorage — no Supabase schema change.
 */

export type CalcTemplate = {
  id: string;
  title: string;
  unit: string;
  /** Suggested unit price (EUR catalog default when from seed). */
  price: number;
  catalogWorkId?: string | null;
  category?: string;
  custom?: boolean;
};

const STORAGE_KEY = 'cpc_calc_custom_templates_v1';

/** Built-in popular works (short Ukrainian labels for on-site use). */
export const POPULAR_TEMPLATES: CalcTemplate[] = [
  {
    id: 'tpl-plaster',
    title: 'Штукатурка',
    unit: 'm²',
    price: 25,
    catalogWorkId: 'work-gypsum-plaster',
    category: 'plaster',
  },
  {
    id: 'tpl-paint',
    title: 'Фарбування',
    unit: 'm²',
    price: 12,
    catalogWorkId: 'work-paint-interior',
    category: 'paint',
  },
  {
    id: 'tpl-drywall',
    title: 'Гіпсокартон',
    unit: 'm²',
    price: 28,
    catalogWorkId: 'work-drywall-partition',
    category: 'drywall',
  },
  {
    id: 'tpl-tile',
    title: 'Плитка',
    unit: 'm²',
    price: 35,
    catalogWorkId: 'work-tile-floor',
    category: 'tiling',
  },
  {
    id: 'tpl-demo',
    title: 'Демонтаж',
    unit: 'm²',
    price: 18,
    catalogWorkId: 'work-demo-wall',
    category: 'demolition',
  },
  {
    id: 'tpl-elec',
    title: 'Електрика',
    unit: 'шт',
    price: 22,
    catalogWorkId: 'work-elec-outlet',
    category: 'electrical',
  },
  {
    id: 'tpl-plumb',
    title: 'Сантехніка',
    unit: 'м',
    price: 18,
    catalogWorkId: 'work-plumb-pipes',
    category: 'plumbing',
  },
];

export const CALC_UNITS = ['m²', 'm', 'шт', 'год', 'день', 'комплект', 'інше'] as const;

export function loadCustomTemplates(): CalcTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CalcTemplate[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && t.id && t.title);
  } catch {
    return [];
  }
}

export function saveCustomTemplates(list: CalcTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function addCustomTemplate(input: {
  title: string;
  unit: string;
  price: number;
}): CalcTemplate {
  const tpl: CalcTemplate = {
    id: `custom-${Date.now()}`,
    title: input.title.trim(),
    unit: input.unit || 'm²',
    price: Number.isFinite(input.price) ? input.price : 0,
    custom: true,
    category: 'other',
  };
  const next = [tpl, ...loadCustomTemplates()].slice(0, 40);
  saveCustomTemplates(next);
  return tpl;
}

export function removeCustomTemplate(id: string): void {
  saveCustomTemplates(loadCustomTemplates().filter((t) => t.id !== id));
}

/** Map UI unit to project_work_items.unit storage. */
export function unitToStorage(unit: string): string {
  const u = (unit || 'm²').trim();
  if (u === 'm²') return 'm2';
  if (u === 'м') return 'm';
  if (u === 'інше') return 'other';
  return u;
}
