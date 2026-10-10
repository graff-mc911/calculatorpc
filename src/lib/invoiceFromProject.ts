import { calculateLineTotal } from './invoiceTotals';
import { normalizeInvoiceUnit } from './invoiceUnits';
import type { ProjectBundle, ProjectWorkItem } from './projectsApi';

export type PrefillInvoiceItem = {
  quantity: number;
  quantityDisplay: string;
  unit: string;
  price: number;
  priceDisplay: string;
  material: string;
  materialDisplay: string;
  description: string;
  total: number;
  /** Original description text from the source document (unchanged). */
  originalDescription?: string;
  /** Raw quantity / price cells before locale normalization. */
  originalQuantityRaw?: string;
  originalPriceRaw?: string;
  originalUnitRaw?: string;
  /** Line needs user review (ambiguous number, unknown unit, missing qty…). */
  needsReview?: boolean;
  reviewWarnings?: string[];
};

export function mapProjectUnitToInvoice(unit: string): string {
  return normalizeInvoiceUnit(unit, 'm²');
}

export function workItemToInvoiceLine(w: ProjectWorkItem): PrefillInvoiceItem {
  const quantity = Number(w.quantity) || 0;
  const price = Number(w.unit_price) || 0;
  const unit = mapProjectUnitToInvoice(w.unit);
  return {
    quantity,
    quantityDisplay: String(quantity),
    unit,
    price,
    priceDisplay: String(price),
    material: '',
    materialDisplay: '',
    description: w.title,
    total: calculateLineTotal(quantity, price, 0),
  };
}

/** Map a project bundle into invoice form fields + line items (no retyping). */
export function prefillInvoiceFromProject(bundle: ProjectBundle): {
  project_id: string;
  client_id: string;
  client_name: string;
  object_address: string;
  currency: string;
  notes: string;
  items: PrefillInvoiceItem[];
} {
  const project = bundle.project;
  return {
    project_id: project.id,
    client_id: project.client_id || '',
    client_name: project.client_name || '',
    object_address: project.address || '',
    currency: project.currency || 'EUR',
    notes: `Об'єкт: ${project.name}`,
    items: bundle.workItems.map(workItemToInvoiceLine),
  };
}

/** Display status: only Draft / Sent / Paid / Overdue. */
export type SimpleInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export function resolveInvoiceStatus(
  status: string | null | undefined,
  dueDate?: string | null
): SimpleInvoiceStatus {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'paid') return 'paid';
  if (s === 'overdue') return 'overdue';
  if (s === 'sent') {
    if (dueDate) {
      const due = new Date(dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!Number.isNaN(due.getTime()) && due < today) return 'overdue';
    }
    return 'sent';
  }
  if (s === 'draft') {
    if (dueDate) {
      const due = new Date(dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!Number.isNaN(due.getTime()) && due < today) return 'overdue';
    }
    return 'draft';
  }
  return 'draft';
}

export const STATUS_LABELS_UK: Record<SimpleInvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
};
