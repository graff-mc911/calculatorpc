import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Globe, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { languages } from '../lib/languages';
import { motion, AnimatePresence } from 'framer-motion';
import { HeaderAnnouncement } from './HeaderAnnouncement';

/**
 * Desktop header — copper hybrid chrome aligned with mockup palette.
 */
export const TopNav: React.FC = () => {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const currentLanguage = languages.find((lang) => lang.code === language) || languages[0];

  return (
    <nav
      className="no-print hidden lg:block fixed top-0 left-0 right-0 z-50"
      style={{
        background: 'var(--cpc-bg)',
        borderBottom: '1px solid var(--cpc-line)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 p-0 m-0 bg-transparent border-0 cursor-pointer shrink-0"
            aria-label="Home"
          >
            <img
              src="/logo-cpc-mark.png"
              alt="CPC"
              className="h-9 w-auto rounded-md object-contain"
              draggable={false}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--cpc-text)' }}>
              CPC
            </span>
          </button>

          <HeaderAnnouncement />

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all"
                style={{ color: 'var(--cpc-muted)' }}
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
                          className="text-left px-3 py-2 text-sm rounded-lg transition-all flex items-center gap-2"
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
              className="p-2 rounded-lg transition-all"
              style={{ color: 'var(--cpc-muted)' }}
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="p-2 rounded-lg transition-all hover:text-red-400"
              style={{ color: 'var(--cpc-muted)' }}
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
