export type CpcChip<T extends string = string> = {
  key: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  chips: CpcChip<T>[];
  active: T;
  onChange: (key: T) => void;
};

/** Compact rounded filter chips — solid copper when active (visual spec). */
export function CpcFilterChips<T extends string>({ chips, active, onChange }: Props<T>) {
  return (
    <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5 scrollbar-hide">
      {chips.map((chip) => {
        const isActive = active === chip.key;
        const count =
          typeof chip.count === 'number' && chip.count > 0 ? ` ${chip.count}` : '';
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(chip.key)}
            className="cpc-chip shrink-0"
            data-active={isActive ? 'true' : 'false'}
          >
            {chip.label}
            {count}
          </button>
        );
      })}
    </div>
  );
}
