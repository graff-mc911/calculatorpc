/**
 * Lightweight CPC app prefs (local) — invoice defaults, currency, owner name.
 * Company/bank/logo stay in company_profile.
 */

export type CpcCurrency = 'EUR' | 'UAH' | 'USD';

export type CpcAppSettings = {
  ownerName: string;
  invoicePrefix: string;
  /** Digits pad for invoice serial, e.g. 4 → 0001 */
  invoicePad: number;
  /** Include year in number: PREFIX-YYYY-0001 */
  invoiceIncludeYear: boolean;
  /** Default due days for new invoices */
  paymentTermsDays: number;
  /** Default VAT % for new invoices (0 = off) */
  defaultVatPercent: number;
  currency: CpcCurrency;
};

const STORAGE_KEY = 'cpc.appSettings';

export const DEFAULT_CPC_SETTINGS: CpcAppSettings = {
  ownerName: '',
  invoicePrefix: 'INV',
  invoicePad: 4,
  invoiceIncludeYear: true,
  paymentTermsDays: 14,
  defaultVatPercent: 0,
  currency: 'EUR',
};

export function loadCpcSettings(): CpcAppSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_CPC_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CPC_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CpcAppSettings>;
    return {
      ...DEFAULT_CPC_SETTINGS,
      ...parsed,
      invoicePad: Math.min(6, Math.max(2, Number(parsed.invoicePad) || 4)),
      paymentTermsDays: Math.min(365, Math.max(0, Number(parsed.paymentTermsDays) || 0)),
      defaultVatPercent: Math.min(100, Math.max(0, Number(parsed.defaultVatPercent) || 0)),
      currency: (['EUR', 'UAH', 'USD'].includes(String(parsed.currency))
        ? parsed.currency
        : 'EUR') as CpcCurrency,
      invoiceIncludeYear: parsed.invoiceIncludeYear !== false,
    };
  } catch {
    return { ...DEFAULT_CPC_SETTINGS };
  }
}

export function saveCpcSettings(next: CpcAppSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Build next invoice number from last serial + prefs. */
export function formatInvoiceNumber(
  settings: CpcAppSettings,
  nextSerial: number
): string {
  const pad = String(Math.max(1, nextSerial)).padStart(settings.invoicePad, '0');
  const prefix = (settings.invoicePrefix || 'INV').trim().replace(/\s+/g, '') || 'INV';
  if (settings.invoiceIncludeYear) {
    return `${prefix}-${new Date().getFullYear()}-${pad}`;
  }
  return `${prefix}-${pad}`;
}
