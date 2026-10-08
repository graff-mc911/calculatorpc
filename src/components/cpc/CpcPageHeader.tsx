import { Plus } from 'lucide-react';

type Props = {
  title: string;
  onNew?: () => void;
  newLabel?: string;
  newDisabled?: boolean;
};

/** Page title row + optional «+ Новий» — visual spec shell. */
export function CpcPageHeader({
  title,
  onNew,
  newLabel = 'Новий',
  newDisabled,
}: Props) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <h1
        className="flex-1 text-[22px] font-semibold truncate leading-tight"
        style={{ color: 'var(--cpc-text)' }}
      >
        {title}
      </h1>
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          disabled={newDisabled}
          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 text-[12px] font-semibold shrink-0 disabled:opacity-40"
          style={{
            background: 'var(--cpc-copper)',
            color: 'var(--cpc-on-copper)',
            borderRadius: 10,
            border: 'none',
          }}
        >
          <Plus size={14} strokeWidth={2.75} />
          {newLabel}
        </button>
      )}
    </div>
  );
}
