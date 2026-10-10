import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../contexts/LanguageContext';
import { languages } from '../lib/languages';
import { supabase } from '../lib/supabase';

/**
 * Mobile header: CPC mark + greeting + language + settings.
 */
export const MobileTopNav: React.FC = () => {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const [greetingName, setGreetingName] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = languages.find((l) => l.code === language) || languages[0];

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from('company_profile')
        .select('company_name')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const name =
        data?.company_name ||
        session.user.user_metadata?.full_name ||
        session.user.email?.split('@')[0] ||
        '';
      setGreetingName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const hello = t('helloGreeting');
  const helloText =
    hello === 'helloGreeting'
      ? greetingName
        ? `Привіт, ${greetingName}`
        : 'Привіт'
      : greetingName
        ? `${hello}, ${greetingName}`
        : hello;

  return (
    <nav
      className="no-print fixed top-0 left-0 right-0 z-50 lg:hidden"
      style={{
        background: 'var(--cpc-bg)',
        borderBottom: '1px solid var(--cpc-line)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="cpc-shell flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="shrink-0 p-0 m-0 bg-transparent border-0 cursor-pointer"
          aria-label="Home"
        >
          <img
            src="/logo-cpc-full.jpg"
            alt="CPC"
            className="h-8 w-auto max-w-[9.5rem] rounded-md object-contain block"
            draggable={false}
          />
        </button>

        <span className="text-[12px] truncate min-w-0" style={{ color: 'var(--cpc-muted)' }}>
          {helloText}
        </span>

        <div className="ml-auto shrink-0 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            className="flex items-center gap-1 min-h-[44px] px-2 rounded-lg active:scale-95 transition-transform"
            style={{ color: 'var(--cpc-muted)' }}
            aria-label={t('language') || 'Мова'}
            aria-expanded={langOpen}
          >
            <Globe className="h-[18px] w-[18px]" />
            <span className="text-[14px] leading-none">{currentLang.flag}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="p-2 rounded-lg active:scale-95 transition-transform"
            style={{ color: 'var(--cpc-muted)' }}
            aria-label="Settings"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {langOpen && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onClick={() => setLangOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute right-3 z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl p-2 shadow-lg"
            style={{
              top: 'calc(100% + 6px)',
              background: 'var(--cpc-card)',
              border: '1px solid var(--cpc-line)',
            }}
            role="menu"
          >
            <div className="grid grid-cols-2 gap-1 max-h-[60vh] overflow-y-auto">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLanguage(lang.code);
                    setLangOpen(false);
                  }}
                  className="flex items-center gap-2 min-h-[44px] px-3 text-left text-sm rounded-lg border-0 cursor-pointer"
                  style={{
                    color:
                      language === lang.code ? 'var(--cpc-copper-light)' : 'var(--cpc-muted)',
                    background:
                      language === lang.code ? 'rgba(200, 121, 74, 0.12)' : 'transparent',
                  }}
                >
                  <span>{lang.flag}</span>
                  <span className="truncate">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </nav>
  );
};
