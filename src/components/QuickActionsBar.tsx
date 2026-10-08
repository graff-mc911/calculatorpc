import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export type QuickActionHandlers = {
  onWork?: () => void;
  onExpense?: () => void;
  onAdvance?: () => void;
  onPdf?: () => void;
};

/**
 * Sticky quick-action strip from mockup: + Робота / + Витрата / + Аванс / PDF
 */
export const QuickActionsBar: React.FC<{
  handlers?: QuickActionHandlers;
  className?: string;
  /** When true, bar sits above BottomNav (default). */
  aboveBottomNav?: boolean;
}> = ({ handlers, className = '', aboveBottomNav = true }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const items = [
    {
      key: 'work',
      label: t('qaWork') === 'qaWork' ? '+ Робота' : t('qaWork'),
      copper: true,
      onClick: handlers?.onWork ?? (() => navigate('/projects')),
    },
    {
      key: 'expense',
      label: t('qaExpense') === 'qaExpense' ? '+ Витрата' : t('qaExpense'),
      copper: true,
      onClick: handlers?.onExpense ?? (() => navigate('/expenses')),
    },
    {
      key: 'advance',
      label: t('qaAdvance') === 'qaAdvance' ? '+ Аванс' : t('qaAdvance'),
      copper: true,
      onClick: handlers?.onAdvance ?? (() => navigate('/projects')),
    },
    {
      key: 'pdf',
      label: t('qaPdf') === 'qaPdf' ? 'PDF' : t('qaPdf'),
      copper: false,
      onClick: handlers?.onPdf ?? (() => navigate('/pdf-creator')),
    },
  ];

  return (
    <div
      className={`no-print grid grid-cols-4 gap-1.5 ${className}`}
      style={
        aboveBottomNav
          ? undefined
          : undefined
      }
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className="min-h-[44px] text-center text-[11px] leading-tight active:scale-[0.98] transition-transform"
          style={{
            background: 'var(--cpc-card)',
            border: '1px solid var(--cpc-line)',
            borderRadius: 9,
            padding: '7px 2px',
            color: item.copper ? 'var(--cpc-copper-light)' : 'var(--cpc-text)',
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
