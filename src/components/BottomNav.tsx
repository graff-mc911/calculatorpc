import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

type Tab = {
  id: string;
  path: string;
  match: (pathname: string) => boolean;
  icon: string;
  labelKey: string;
  fallback: string;
};

const TABS: Tab[] = [
  {
    id: 'overview',
    path: '/',
    match: (p) => p === '/',
    icon: '⌂',
    labelKey: 'navOverview',
    fallback: 'Огляд',
  },
  {
    id: 'projects',
    path: '/projects',
    match: (p) => p === '/projects' || p.startsWith('/projects/'),
    icon: '▤',
    labelKey: 'navProjects',
    fallback: 'Об’єкти',
  },
  {
    id: 'calculator',
    path: '/calculator',
    match: (p) => p.startsWith('/calculator'),
    icon: '▦',
    labelKey: 'navCalculator',
    fallback: 'Калькулятор',
  },
  {
    id: 'invoices',
    path: '/invoices',
    match: (p) => p.startsWith('/invoices'),
    icon: '▭',
    labelKey: 'navInvoices',
    fallback: 'Рахунки',
  },
  {
    id: 'clients',
    path: '/clients',
    match: (p) => p.startsWith('/clients'),
    icon: '☺',
    labelKey: 'navClients',
    fallback: 'Клієнти',
  },
];

/**
 * Mobile bottom tab bar — Калькулятор is a dedicated field calculator at /calculator.
 */
export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLanguage();

  // Prefer more specific matches (calculator / invoices) before broad project match
  const activeId =
    TABS.find((tab) => tab.id !== 'projects' && tab.match(pathname))?.id ||
    TABS.find((tab) => tab.id === 'projects' && tab.match(pathname))?.id ||
    (pathname === '/' ? 'overview' : '');

  return (
    <nav
      className="no-print fixed bottom-0 inset-x-0 z-40 border-t"
      style={{
        background: 'var(--cpc-bg)',
        borderColor: 'var(--cpc-line)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      aria-label="Main"
    >
      <div className="max-w-[430px] mx-auto flex justify-between px-1 pt-1.5 pb-1">
        {TABS.map((tab) => {
          const active = tab.id === activeId;
          const label = t(tab.labelKey);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center gap-0.5 min-h-[44px] bg-transparent border-0 cursor-pointer"
              style={{
                color: active ? 'var(--cpc-copper-light)' : 'var(--cpc-muted)',
                fontSize: 11,
                lineHeight: 1.2,
              }}
              aria-current={active ? 'page' : undefined}
            >
              <span className="block text-[15px] font-normal leading-tight" aria-hidden>
                {tab.icon}
              </span>
              <span>{label === tab.labelKey ? tab.fallback : label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
