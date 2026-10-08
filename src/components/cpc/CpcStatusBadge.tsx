type Tone = 'draft' | 'active' | 'wait' | 'paid' | 'overdue' | 'muted';

const TONE_STYLE: Record<Tone, { bg: string; fg: string }> = {
  draft: { bg: 'var(--cpc-line)', fg: 'var(--cpc-muted)' },
  active: { bg: 'rgba(70, 110, 180, 0.28)', fg: '#9ec0f0' },
  wait: { bg: 'var(--cpc-badge-wait-bg)', fg: 'var(--cpc-badge-wait-fg)' },
  paid: { bg: 'var(--cpc-badge-paid-bg)', fg: 'var(--cpc-badge-paid-fg)' },
  overdue: { bg: 'rgba(180, 60, 60, 0.28)', fg: '#f0a0a0' },
  muted: { bg: 'var(--cpc-line)', fg: 'var(--cpc-muted)' },
};

type Props = {
  label: string;
  tone?: Tone;
};

export function CpcStatusBadge({ label, tone = 'muted' }: Props) {
  const s = TONE_STYLE[tone] || TONE_STYLE.muted;
  return (
    <span
      className="inline-flex items-center shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight"
      style={{ background: s.bg, color: s.fg }}
    >
      {label}
    </span>
  );
}

export function projectStatusTone(status: string): Tone {
  if (status === 'paid') return 'paid';
  if (status === 'completed') return 'wait';
  if (status === 'in_progress') return 'active';
  if (status === 'draft') return 'draft';
  return 'muted';
}

export function projectStatusLabel(status: string): string {
  if (status === 'paid') return 'Оплачено';
  if (status === 'completed') return 'Очікує оплати';
  if (status === 'in_progress') return 'В роботі';
  if (status === 'draft') return 'Чернетка';
  return status;
}

export function invoiceStatusTone(status: string): Tone {
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  if (status === 'sent') return 'wait';
  if (status === 'draft') return 'draft';
  return 'muted';
}

export function invoiceStatusLabel(status: string): string {
  if (status === 'paid') return 'Оплачено';
  if (status === 'overdue') return 'Прострочено';
  if (status === 'sent') return 'Очікує оплати';
  if (status === 'draft') return 'Чернетка';
  return status;
}
