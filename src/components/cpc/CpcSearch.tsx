import { Search, X } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
};

/** Compact full-width search — visual spec shell. */
export function CpcSearch({ value, onChange, placeholder, className = '' }: Props) {
  return (
    <div
      className={`cpc-search flex items-center gap-2 px-3 min-h-[42px] mb-2.5 ${className}`}
    >
      <Search size={15} style={{ color: 'var(--cpc-muted)' }} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-0 outline-none text-[13px] min-w-0"
        style={{ color: 'var(--cpc-text)' }}
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="p-1 bg-transparent border-0 min-h-[32px] min-w-[32px]"
          style={{ color: 'var(--cpc-muted)' }}
          aria-label="Очистити"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
