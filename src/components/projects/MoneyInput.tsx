import {
  formatMoneyInput,
  formatQtyDisplay,
  maskMoneyTyping,
  maskQtyTyping,
  parseMoneyInput,
} from '../../lib/moneyMask';

type MoneyProps = {
  label?: string;
  value: string;
  onChange: (masked: string) => void;
  onCommit?: (n: number) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  currencyHint?: string;
  disabled?: boolean;
};

/** Controlled money field with `1 500,00` mask while typing. */
export function MoneyInput({
  label,
  value,
  onChange,
  onCommit,
  placeholder = '0,00',
  className = '',
  inputClassName = '',
  currencyHint = '€',
  disabled,
}: MoneyProps) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-white/55 mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(maskMoneyTyping(e.target.value))}
          onBlur={() => {
            const n = parseMoneyInput(value);
            if (Number.isFinite(n)) {
              onChange(formatMoneyInput(n, 2));
              onCommit?.(n);
            } else if (value.trim() === '') {
              onChange('');
            }
          }}
          className={`w-full min-h-[44px] bg-white/[0.07] border border-white/15 rounded-xl text-white text-base tabular-nums py-3 pl-3 pr-10 focus:outline-none focus:border-orange-400/70 focus:bg-white/10 transition-all ${inputClassName}`}
        />
        {currencyHint && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">
            {currencyHint}
          </span>
        )}
      </div>
    </div>
  );
}

type QtyProps = {
  value: string;
  onChange: (masked: string) => void;
  onCommit?: (n: number) => void;
  className?: string;
  ariaLabel?: string;
};

/** Inline qty with decimal support (`12,5`). min-h 44px touch target. */
export function QtyInput({ value, onChange, onCommit, className = '', ariaLabel }: QtyProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(maskQtyTyping(e.target.value))}
      onBlur={() => {
        const n = parseMoneyInput(value);
        if (Number.isFinite(n) && n >= 0) {
          onChange(formatQtyDisplay(n));
          onCommit?.(n);
        }
      }}
      className={`w-16 min-h-[44px] min-w-0 bg-black/30 border border-white/15 rounded-lg text-white text-sm tabular-nums text-center py-2.5 px-1 focus:outline-none focus:border-orange-400/70 ${className}`}
    />
  );
}
