/** Lightweight contact helpers — not a CRM. */

const NOTE_KEY = (clientId: string) => `cpc.clientNote.${clientId}`;

/** Local fallback until `clients.note` migration is applied in prod. */
export function readLocalClientNote(clientId: string | null | undefined): string {
  if (!clientId || typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(NOTE_KEY(clientId)) || '';
  } catch {
    return '';
  }
}

export function writeLocalClientNote(clientId: string, note: string): void {
  if (!clientId || typeof localStorage === 'undefined') return;
  try {
    const trimmed = note.trim();
    if (trimmed) localStorage.setItem(NOTE_KEY(clientId), trimmed);
    else localStorage.removeItem(NOTE_KEY(clientId));
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveClientNote(
  clientId: string | null | undefined,
  remoteNote: string | null | undefined
): string {
  const remote = String(remoteNote || '').trim();
  if (remote) return remote;
  return readLocalClientNote(clientId);
}

export function isMissingNoteColumnError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || error || '').toLowerCase();
  const code = String((error as { code?: string })?.code || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('note') && (msg.includes('column') || msg.includes('schema cache')))
  );
}

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
