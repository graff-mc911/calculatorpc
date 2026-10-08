/** Lightweight contact helpers — not a CRM. */

export function digitsOnlyPhone(phone: string | null | undefined): string {
  return String(phone || '').replace(/[^\d+]/g, '');
}

export function telHref(phone: string | null | undefined): string | null {
  const d = digitsOnlyPhone(phone);
  if (!d || d.replace(/\D/g, '').length < 5) return null;
  return `tel:${d}`;
}

/** WhatsApp needs country code digits without + for wa.me */
export function whatsappHref(phone: string | null | undefined): string | null {
  const d = digitsOnlyPhone(phone).replace(/^\+/, '');
  const digits = d.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

export function mailtoHref(email: string | null | undefined): string | null {
  const e = String(email || '').trim();
  if (!e || !e.includes('@')) return null;
  return `mailto:${encodeURIComponent(e)}`;
}

export type ClientMoneyStats = {
  projectCount: number;
  invoiceCount: number;
  received: number;
  debt: number;
};

export function emptyClientStats(): ClientMoneyStats {
  return { projectCount: 0, invoiceCount: 0, received: 0, debt: 0 };
}
