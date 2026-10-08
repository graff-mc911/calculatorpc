import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Banknote, FileText, Plus, Wallet, Wrench, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getLastProjectId } from '../lib/lastProject';
import { listProjects, type Project } from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

export type QuickActionHandlers = {
  onWork?: () => void;
  onExpense?: () => void;
  onAdvance?: () => void;
  onPdf?: () => void;
};

type SheetAction = 'work' | 'expense' | 'prepayment' | 'invoice';

const SHEET_ACTIONS: {
  id: SheetAction;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: 'work', label: 'Робота', hint: 'кількість · ціна', Icon: Wrench },
  { id: 'expense', label: 'Витрата', hint: 'сума → готово', Icon: Wallet },
  { id: 'prepayment', label: 'Аванс', hint: 'сума → готово', Icon: Banknote },
  { id: 'invoice', label: 'Рахунок', hint: 'з об’єкта', Icon: FileText },
];

function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([0-9a-f-]{36})/i);
  return m?.[1] || null;
}

/**
 * Quick-action strip: + Робота / + Витрата / [copper +] / + Аванс / PDF
 */
export const QuickActionsBar: React.FC<{
  handlers?: QuickActionHandlers;
  className?: string;
}> = ({ handlers, className = '' }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<SheetAction | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id && open,
    queryFn: listProjects,
    retry: false,
    staleTime: 30_000,
  });

  const resolveProjectId = (): string | null => {
    const fromPath = projectIdFromPath(pathname);
    if (fromPath) return fromPath;
    const last = getLastProjectId();
    if (last) {
      if (!(projects as Project[]).length) return last;
      if ((projects as Project[]).some((p) => p.id === last)) return last;
    }
    if ((projects as Project[]).length === 1) return (projects as Project[])[0].id;
    return null;
  };

  const goWithProject = (projectId: string, action: SheetAction) => {
    setOpen(false);
    setPendingAction(null);
    if (action === 'invoice') {
      navigate(`/invoices/new?project_id=${projectId}&from_project=1`);
      return;
    }
    navigate(`/projects/${projectId}?add=${action}`);
  };

  const onPickAction = (action: SheetAction) => {
    const pid = resolveProjectId();
    if (pid) {
      goWithProject(pid, action);
      return;
    }
    setPendingAction(action);
  };

  const recentProjects = useMemo(() => {
    const list = [...(projects as Project[])];
    const last = getLastProjectId();
    if (last) {
      list.sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));
    }
    return list.slice(0, 8);
  }, [projects]);

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
      key: 'plus',
      kind: 'fab' as const,
      onClick: () => {
        setPendingAction(null);
        setOpen(true);
      },
    },
    {
      key: 'advance',
      label: t('qaAdvance') === 'qaAdvance' ? '+ Аванс' : t('qaAdvance'),
      copper: true,
      onClick: handlers?.onAdvance ?? (() => navigate('/payments')),
    },
    {
      key: 'pdf',
      label: t('qaPdf') === 'qaPdf' ? 'PDF' : t('qaPdf'),
      copper: false,
      onClick: handlers?.onPdf ?? (() => navigate('/pdf-creator')),
    },
  ];

  return (
    <>
      <div className={`no-print grid grid-cols-5 gap-1.5 items-center ${className}`}>
        {items.map((item) =>
          'kind' in item && item.kind === 'fab' ? (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="min-h-[44px] h-[44px] w-full flex items-center justify-center border-0 active:scale-95 transition-transform"
              style={{
                background: 'var(--cpc-copper)',
                color: 'var(--cpc-on-copper)',
                borderRadius: 12,
                boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
              }}
              aria-label="Додати"
            >
              <Plus size={22} strokeWidth={2.75} />
            </button>
          ) : (
            <button
              key={item.key}
              type="button"
              onClick={'onClick' in item ? item.onClick : undefined}
              className="min-h-[44px] text-center text-[11px] leading-tight active:scale-[0.98] transition-transform"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 9,
                padding: '7px 2px',
                color:
                  'copper' in item && item.copper
                    ? 'var(--cpc-copper-light)'
                    : 'var(--cpc-text)',
              }}
            >
              {'label' in item ? item.label : null}
            </button>
          )
        )}
      </div>

      {open && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => {
            setOpen(false);
            setPendingAction(null);
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-[var(--cpc-shell-max)] md:max-w-[480px] px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Швидкі дії"
          >
            <div
              className="p-3"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 18,
              }}
            >
              <div className="flex items-center justify-between mb-2 px-0.5">
                <div>
                  <p
                    className="text-[15px] font-medium"
                    style={{ color: 'var(--cpc-text)' }}
                  >
                    {pendingAction ? 'Оберіть об’єкт' : 'Додати'}
                  </p>
                  <p className="cpc-muted text-[12px] mt-0.5">
                    {pendingAction
                      ? `Далі: ${SHEET_ACTIONS.find((a) => a.id === pendingAction)?.label}`
                      : 'На об’єкті — без зайвих меню'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setPendingAction(null);
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
                  aria-label="Закрити"
                >
                  <X size={20} />
                </button>
              </div>

              {!pendingAction ? (
                <div className="grid grid-cols-2 gap-2">
                  {SHEET_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPickAction(a.id)}
                      className="min-h-[72px] flex flex-col items-start justify-center gap-1 px-3 text-left active:scale-[0.98] transition-transform"
                      style={{
                        background: 'var(--cpc-bg)',
                        border: '1px solid var(--cpc-line)',
                        borderRadius: 14,
                        color: 'var(--cpc-text)',
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium cpc-copper">
                        <a.Icon size={16} /> + {a.label}
                      </span>
                      <span className="cpc-muted text-[11px]">{a.hint}</span>
                    </button>
                  ))}
                </div>
              ) : recentProjects.length === 0 ? (
                <div className="text-center py-4">
                  <p className="cpc-muted text-sm mb-3">Спочатку створіть об’єкт</p>
                  <button
                    type="button"
                    className="cpc-btn-primary min-h-[48px] px-5"
                    onClick={() => {
                      setOpen(false);
                      setPendingAction(null);
                      navigate('/projects');
                    }}
                  >
                    До об’єктів
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                  {recentProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => goWithProject(p.id, pendingAction)}
                      className="w-full min-h-[52px] px-3 text-left flex items-center justify-between gap-2 active:scale-[0.99] transition-transform"
                      style={{
                        background: 'var(--cpc-bg)',
                        border: '1px solid var(--cpc-line)',
                        borderRadius: 12,
                        color: 'var(--cpc-text)',
                      }}
                    >
                      <span className="truncate text-[14px] font-medium">{p.name}</span>
                      <span className="cpc-copper text-[12px] shrink-0">→</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPendingAction(null)}
                    className="w-full min-h-[40px] text-[13px] bg-transparent border-0 cpc-muted"
                  >
                    ← Назад до дій
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
