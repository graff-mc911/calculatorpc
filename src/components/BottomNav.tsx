import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../contexts/LanguageContext';
import { listProjects, type Project } from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

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
    match: (p) => p === '/projects',
    icon: '▤',
    labelKey: 'navProjects',
    fallback: 'Об’єкти',
  },
  {
    id: 'calculator',
    // Project-detail estimator; list / first project is the entry point
    path: '/projects',
    match: (p) => p.startsWith('/projects/'),
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
 * Mobile bottom tab bar matching CPC copper hybrid mockup (1a92).
 * Огляд = Home calculator; Калькулятор → first project detail or /projects.
 */
export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLanguage();

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
  });

  const activeId =
    TABS.find((tab) => tab.match(pathname))?.id ||
    (pathname === '/' ? 'overview' : '');

  const onTab = (tab: Tab) => {
    if (tab.id === 'calculator') {
      const first = (projects as Project[])[0];
      navigate(first ? `/projects/${first.id}` : '/projects');
      return;
    }
    navigate(tab.path);
  };

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
              onClick={() => onTab(tab)}
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
