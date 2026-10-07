import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Globe, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { languages } from '../lib/languages';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './Logo';
import { HeaderAnnouncement } from './HeaderAnnouncement';

/**
 * App header: logo (→ Home), optional announcement (middle), language, settings, logout.
 * Page-link nav (Home / Invoices / Contacts / Receipts / Scan / Account) removed —
 * navigation is via Home cards + logo.
 */
export const TopNav: React.FC = () => {
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const currentLanguage = languages.find((lang) => lang.code === language) || languages[0];

  return (
    <nav className="no-print hidden lg:block fixed top-0 left-0 right-0 z-50 bg-white/10 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <Logo variant="glass" size="md" />

          <HeaderAnnouncement />

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">{currentLanguage.flag}</span>
              </button>
              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-80 bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl shadow-lg overflow-hidden p-2 z-50"
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
                          className={`text-left px-3 py-2 text-sm hover:bg-white/10 rounded-lg transition-all flex items-center gap-2 ${
                            language === lang.code
                              ? 'text-orange-500 bg-orange-500/10'
                              : 'text-white/70'
                          }`}
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
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="p-2 text-white/70 hover:text-red-400 hover:bg-white/10 rounded-lg transition-all"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
