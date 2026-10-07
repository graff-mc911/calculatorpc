import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun, Globe, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { languages } from '../lib/languages';
import { Logo } from './Logo';
import { HeaderAnnouncement } from './HeaderAnnouncement';

/**
 * Mobile header: logo (→ Home), optional announcement, language, theme, settings, logout.
 * Hamburger page-link menu removed — navigation is via Home cards + logo.
 */
export const MobileTopNav: React.FC = () => {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const currentLanguage = languages.find((lang) => lang.code === language) || languages[0];

  return (
    <nav className="no-print lg:hidden fixed top-0 left-0 right-0 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 z-50 shadow-lg">
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <Logo variant="glass" size="sm" />

        <HeaderAnnouncement compact className="dark:text-inherit" />

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
            aria-label="Select language"
          >
            <Globe className="h-5 w-5 text-brand-anthracite dark:text-white" />
            <span className="absolute -top-0.5 -right-0.5 text-xs">{currentLanguage.flag}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun className="h-5 w-5 text-brand-anthracite dark:text-white" />
            ) : (
              <Moon className="h-5 w-5 text-brand-anthracite dark:text-white" />
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5 text-brand-anthracite dark:text-white" />
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="p-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5 text-red-500" />
          </button>
        </div>
      </div>

      {showLanguageMenu && (
        <div className="absolute top-full left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 shadow-premium">
          <div className="grid grid-cols-2 gap-2 p-3">
            {languages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLanguage(lang.code);
                  setShowLanguageMenu(false);
                }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left ${
                  language === lang.code ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-500' : ''
                }`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{lang.name}</span>
                {language === lang.code && (
                  <span className="ml-auto text-orange-500">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};
