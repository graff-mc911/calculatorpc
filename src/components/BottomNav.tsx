import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Calculator,
  FileText,
  Home,
  Users,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { QuickActionsBar } from './QuickActionsBar';
import { useQuickActionsContext } from './QuickActionsContext';

type Tab = {
  id: string;
  path: string;
  match: (pathname: string) => boolean;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

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

/**
 * Mobile bottom nav — quick actions (with copper +) above 5 tabs.
 */
export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const qa = useQuickActionsContext();

  const activeId =
    TABS.find((tab) => tab.id !== 'projects' && tab.match(pathname))?.id ||
    TABS.find((tab) => tab.id === 'projects' && tab.match(pathname))?.id ||
    (pathname === '/' ? 'home' : '');

  return (
    <nav
      className="no-print fixed bottom-0 inset-x-0 z-40 lg:hidden"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      aria-label="Main"
    >
      <div
        className="cpc-shell"
        style={{
          background: 'var(--cpc-bg)',
          borderTop: '1px solid var(--cpc-line)',
        }}
      >
        <div className="px-3 pt-2">
          <QuickActionsBar handlers={qa?.handlers} />
        </div>

        <div className="flex items-stretch px-0.5 pt-1.5 pb-1">
          {TABS.map((tab) => {
            const active = tab.id === activeId;
            const labelKey = `nav${tab.id.charAt(0).toUpperCase()}${tab.id.slice(1)}`;
            const translated = t(labelKey);
            const label = translated === labelKey ? tab.label : translated;
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
                }}
                aria-current={active ? 'page' : undefined}
              >
                <tab.Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                <span className="truncate max-w-full px-0.5">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
