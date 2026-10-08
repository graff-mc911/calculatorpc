import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Building2,
  Calculator,
  FileText,
  Home,
  Plus,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getLastProjectId } from '../lib/lastProject';
import { listProjects, type Project } from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

type Tab = {
  id: string;
  path: string;
  match: (pathname: string) => boolean;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

type QuickAction = 'work' | 'expense' | 'prepayment' | 'invoice';

const TABS: Tab[] = [
  {
    id: 'home',
    path: '/',
    match: (p) => p === '/',
    label: 'Огляд',
    Icon: Home,
  },
  {
    id: 'projects',
    path: '/projects',
    match: (p) => p === '/projects' || p.startsWith('/projects/'),
    label: 'Проекти',
    Icon: Building2,
  },
  {
    id: 'calculator',
    path: '/calculator',
    match: (p) => p.startsWith('/calculator'),
    label: 'Калькулятор',
    Icon: Calculator,
  },
  {
    id: 'invoices',
    path: '/invoices',
    match: (p) => p.startsWith('/invoices'),
    label: 'Рахунки',
    Icon: FileText,
  },
  {
    id: 'clients',
    path: '/clients',
    match: (p) => p.startsWith('/clients'),
    label: 'Клієнти',
    Icon: Users,
  },
];

const ACTIONS: {
  id: QuickAction;
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
 * Mobile bottom nav — 5 sections + center FAB for field quick-add.
 * + opens one sheet: Робота / Витрата / Аванс / Рахунок (no nested menus).
 */
export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<QuickAction | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
    staleTime: 30_000,
  });

  const activeId =
    TABS.find((tab) => tab.id !== 'projects' && tab.match(pathname))?.id ||
    TABS.find((tab) => tab.id === 'projects' && tab.match(pathname))?.id ||
    (pathname === '/' ? 'home' : '');

  const currentProjectId = projectIdFromPath(pathname);

  const resolveProjectId = (): string | null => {
    if (currentProjectId) return currentProjectId;
    const last = getLastProjectId();
    if (last) {
      // Prefer last object even before list finishes loading
      if (!(projects as Project[]).length) return last;
      if ((projects as Project[]).some((p) => p.id === last)) return last;
    }
    if ((projects as Project[]).length === 1) return (projects as Project[])[0].id;
    return null;
  };

  const goWithProject = (projectId: string, action: QuickAction) => {
    setOpen(false);
    setPendingAction(null);
    if (action === 'invoice') {
      navigate(`/invoices/new?project_id=${projectId}&from_project=1`);
      return;
    }
    navigate(`/projects/${projectId}?add=${action}`);
  };

  const onPickAction = (action: QuickAction) => {
    const pid = resolveProjectId();
    if (pid) {
      goWithProject(pid, action);
      return;
    }
    // Need to pick an object first — same sheet, no extra menu levels
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

  return (
    <>
      <nav
        className="no-print fixed bottom-0 inset-x-0 z-40"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        aria-label="Main"
      >
        <div
          className="max-w-[430px] mx-auto relative pt-1"
          style={{
            background: 'var(--cpc-bg)',
            borderTop: '1px solid var(--cpc-line)',
          }}
        >
          {/* Center FAB — field quick-add */}
          <button
            type="button"
            onClick={() => {
              setPendingAction(null);
              setOpen(true);
            }}
            className="absolute left-1/2 -translate-x-1/2 -top-6 w-[56px] h-[56px] flex items-center justify-center border-0 shadow-lg active:scale-95 transition-transform"
            style={{
              background: 'var(--cpc-copper)',
              color: 'var(--cpc-on-copper)',
              borderRadius: 18,
              zIndex: 2,
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            }}
            aria-label="Додати"
          >
            <Plus size={28} strokeWidth={2.5} />
          </button>

          <div className="flex items-stretch px-0.5 pt-2 pb-1">
            {TABS.map((tab) => {
              const active = tab.id === activeId;
              const labelKey = `nav${tab.id.charAt(0).toUpperCase()}${tab.id.slice(1)}`;
              const translated = t(labelKey);
              const label = translated === labelKey ? tab.label : translated;
              // Leave visual breathing room under FAB for center tab (Калькулятор)
              const isCenter = tab.id === 'calculator';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(tab.path)}
                  className="flex-1 flex flex-col items-center justify-end gap-0.5 min-h-[52px] pb-1 bg-transparent border-0 cursor-pointer"
                  style={{
                    color: active ? 'var(--cpc-copper-light)' : 'var(--cpc-muted)',
                    fontSize: 10,
                    lineHeight: 1.15,
                    opacity: isCenter ? 0.92 : 1,
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  <tab.Icon size={isCenter ? 18 : 20} strokeWidth={active ? 2.25 : 1.75} />
                  <span className="truncate max-w-full px-0.5">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

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
            className="w-full max-w-[430px] px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]"
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
                      ? `Далі: ${ACTIONS.find((a) => a.id === pendingAction)?.label}`
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
                  {ACTIONS.map((a) => (
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
