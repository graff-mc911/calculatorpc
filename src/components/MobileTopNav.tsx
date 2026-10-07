import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

/**
 * Mobile header matching mockup: CPC mark + greeting + settings.
 */
export const MobileTopNav: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [greetingName, setGreetingName] = useState('');

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
      className="no-print fixed top-0 left-0 right-0 z-50"
      style={{
        background: 'var(--cpc-bg)',
        borderBottom: '1px solid var(--cpc-line)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="max-w-[430px] mx-auto flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="shrink-0 p-0 m-0 bg-transparent border-0 cursor-pointer"
          aria-label="Home"
        >
          <img
            src="/logo-cpc-mark.png"
            alt="CPC"
            className="h-[30px] w-auto rounded-md object-contain block"
            draggable={false}
          />
        </button>

        <span className="text-[12px] truncate" style={{ color: 'var(--cpc-muted)' }}>
          {helloText}
        </span>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="ml-auto p-2 rounded-lg active:scale-95 transition-transform"
          style={{ color: 'var(--cpc-muted)' }}
          aria-label="Settings"
        >
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>
    </nav>
  );
};
