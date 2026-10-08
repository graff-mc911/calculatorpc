import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Calculator,
  FileText,
  Globe,
  Home,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { languages } from '../lib/languages';
import { motion, AnimatePresence } from 'framer-motion';
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
  { id: 'home', path: '/', match: (p) => p === '/', label: 'Огляд', Icon: Home },
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
 * Desktop header — primary nav + quick actions for monitor layouts.
 */
export const TopNav: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const qa = useQuickActionsContext();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const currentLanguage = languages.find((lang) => lang.code === language) || languages[0];

  const activeId =
    TABS.find((tab) => tab.id !== 'projects' && tab.match(pathname))?.id ||
    TABS.find((tab) => tab.id === 'projects' && tab.match(pathname))?.id ||
    (pathname === '/' ? 'home' : '');

  return (
    <nav
      className="no-print hidden lg:block fixed top-0 left-0 right-0 z-50"
      style={{
        background: 'var(--cpc-bg)',
        borderBottom: '1px solid var(--cpc-line)',
      }}
      aria-label="Desktop"
    >
      <div className="cpc-shell px-4 xl:px-6">
        <div className="flex items-center justify-between h-14 gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 p-0 m-0 bg-transparent border-0 cursor-pointer shrink-0"
            aria-label="Home"
          >
            <img
              src="/logo-cpc-full.jpg"
              alt="CPC — Construction Project Calculator"
              className="h-9 w-auto max-w-[11rem] rounded-md object-contain"
              draggable={false}
            />
          </button>

          <div className="flex items-center gap-1 flex-1 justify-center min-w-0 px-2">
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
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-[13px] font-medium border-0 cursor-pointer transition-colors"
                  style={{
                    color: active ? 'var(--cpc-copper-light)' : 'var(--cpc-muted)',
                    background: active ? 'rgba(200,121,74,0.12)' : 'transparent',
                  }}
                  aria-current={active ? 'page' : undefined}
                >
                  <tab.Icon size={16} strokeWidth={active ? 2.25 : 1.75} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all border-0 bg-transparent cursor-pointer"
                style={{ color: 'var(--cpc-muted)' }}
              >
                <Globe className="h-4 w-4" />
                <span>{currentLanguage.flag}</span>
              </button>
              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-lg overflow-hidden p-2 z-50"
                    style={{
                      background: 'var(--cpc-card)',
                      border: '1px solid var(--cpc-line)',
                    }}
                  >
                    <div className="grid grid-cols-2 gap-1">
                      {languages.map((lang) => (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => {
                            setLanguage(lang.code);
                            setShowLanguageMenu(false);
                          }}
                          className="text-left px-3 py-2 text-sm rounded-lg transition-all flex items-center gap-2 border-0 cursor-pointer"
                          style={{
                            color:
                              language === lang.code
                                ? 'var(--cpc-copper-light)'
                                : 'var(--cpc-muted)',
                            background:
                              language === lang.code
                                ? 'rgba(200, 121, 74, 0.12)'
                                : 'transparent',
                          }}
                        >
                          <span>{lang.flag}</span>
                          <span className="truncate">{lang.name}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="p-2 rounded-lg transition-all border-0 bg-transparent cursor-pointer"
              style={{ color: 'var(--cpc-muted)' }}
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="p-2 rounded-lg transition-all hover:text-red-400 border-0 bg-transparent cursor-pointer"
              style={{ color: 'var(--cpc-muted)' }}
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="pb-2.5">
          <QuickActionsBar handlers={qa?.handlers} />
        </div>
      </div>
    </nav>
  );
};
