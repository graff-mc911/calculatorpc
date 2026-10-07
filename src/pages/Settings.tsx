import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Moon, Sun, LogOut, ArrowLeft, Trash2, AlertTriangle, Zap, Check, Crown, Shield, MessageCircle, MessagesSquare } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { checkIsAppOwner } from '../lib/ownerAccess';
import {
  COMMUNITY_COUNTRIES,
  fetchMyAppMeta,
  setMyCommunityCountry,
  type CommunityCountryCode,
} from '../lib/chatApi';
import { useToastContext } from '../contexts/ToastContext';
import { CompanyProfileForm } from '../components/CompanyProfileForm';

const MONTHLY_LINK = 'https://buy.stripe.com/test_bJe14o2ip6Oe99f0N49oc00';
const YEARLY_LINK = 'https://buy.stripe.com/test_eVq5kEbSZ0pQ5X3dzQ9oc01';

const FEATURES = [
  'Необмежена кількість рахунків',
  'Необмежена кількість клієнтів',
  'Генерація PDF рахунків',
  'Сканер та OCR квитанцій',
  'Створення PDF документів',
  'Хмарна синхронізація',
  'Підпис на документах',
  'Мультимовний інтерфейс',
];

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToastContext();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: subscription } = useQuery({
    queryKey: ['subscription', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', session!.user.id)
        .in('status', ['active', 'trialing'])
        .maybeSingle();
      return data;
    },
  });

  const { data: isOwner } = useQuery({
    queryKey: ['is-app-owner', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: () => checkIsAppOwner(session!.user.id),
    staleTime: 60_000,
    retry: false,
  });

  const { data: appMeta } = useQuery({
    queryKey: ['user-app-meta', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: fetchMyAppMeta,
    retry: false,
  });

  const isActive = !!subscription;

  const buildLink = (base: string) => {
    if (!session?.user) return base;
    const params = new URLSearchParams({
      client_reference_id: session.user.id,
      prefilled_email: session.user.email ?? '',
    });
    return `${base}?${params.toString()}`;
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('invoices').delete().eq('user_id', user.id);
      await supabase.from('clients').delete().eq('user_id', user.id);
      await supabase.from('receipts').delete().eq('user_id', user.id);
      await supabase.from('company_profile').delete().eq('user_id', user.id);

      await supabase.auth.signOut();
      navigate('/login');
    } catch {
      setDeleting(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-subscription`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentSession?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['subscription'] });
        setShowCancelConfirm(false);
      }
    } finally {
      setCanceling(false);
    }
  };

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

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center p-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl mb-6 transition-all active:scale-95"
        title={t('back') || 'Назад'}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <h1 className="text-2xl font-semibold text-white mb-6">
        {t('settings') || 'Налаштування'}
      </h1>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-white mb-3">
            {t('companyProfile') || 'Профіль компанії / ФОП'}
          </h2>
          <CompanyProfileForm />
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <h2 className="text-lg font-medium text-white mb-4">
            {t('account') || 'Акаунт'}
          </h2>
          <button
            type="button"
            onClick={() => navigate('/contact')}
            className="flex items-center justify-between w-full py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2 text-white">
              <MessageCircle className="h-4 w-4 text-white/50" />
              {t('contactUs') || 'Зв’язатися з нами'}
            </span>
            <span className="text-white/40">›</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="flex items-center justify-between w-full py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2 text-white">
              <MessagesSquare className="h-4 w-4 text-white/50" />
              {t('chatNav') || 'Спільнота'}
            </span>
            <span className="text-white/40">›</span>
          </button>
          <div className="pt-2 px-2">
            <p className="text-white/50 text-xs mb-2">
              {t('chatPickCountry') || 'Community country'}
              {appMeta?.country_code ? ` · ${appMeta.country_code}` : ''}
            </p>
            <p className="text-white/30 text-[11px] mb-2">
              {t('chatCountryChangeWarn') ||
                'Changing country switches your country chat room. Prefer Contact Us if unsure.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={async () => {
                    try {
                      await setMyCommunityCountry(c.code as CommunityCountryCode);
                      await queryClient.invalidateQueries({ queryKey: ['user-app-meta'] });
                      showSuccess(t('chatCountrySaved') || 'Country saved');
                    } catch {
                      showError(t('chatCountryFailed') || 'Could not save country');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${
                    appMeta?.country_code === c.code
                      ? 'bg-teal-500/20 border-teal-500/40 text-teal-200'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {t(`chatCountry_${c.code}`) || c.code}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-orange-500/20 rounded-xl flex items-center justify-center">
                <Shield className="h-4 w-4 text-orange-400" />
              </div>
              <h2 className="text-lg font-medium text-white">Власник</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/owner')}
              className="flex items-center justify-between w-full py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span className="text-white">Кабінет власника</span>
              <span className="text-white/40">›</span>
            </button>
          </div>
        )}

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <h2 className="text-lg font-medium text-white mb-4">
            {t('appearance') || 'Зовнішній вигляд'}
          </h2>

          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="h-5 w-5 text-white/70" /> : <Sun className="h-5 w-5 text-white/70" />}
              <div>
                <p className="font-medium text-white">
                  {t('theme') || 'Тема'}
                </p>
                <p className="text-sm text-white/60">
                  {isDark ? (t('darkTheme') || 'Темна тема') : (t('lightTheme') || 'Світла тема')}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl transition-all active:scale-95"
            >
              {isDark ? (t('switchToLight') || 'Світла') : (t('switchToDark') || 'Темна')}
            </button>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <Zap className="h-4 w-4 text-orange-400" />
            </div>
            <h2 className="text-lg font-medium text-white">Construction Project Calculator</h2>
          </div>

          {isActive ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 py-3 px-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <Crown className="h-5 w-5 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-green-400 font-medium text-sm">Підписка активна</p>
                  <p className="text-white/50 text-xs mt-0.5">
                    {subscription?.plan === 'yearly' ? 'Річний план' : 'Місячний план'}
                    {subscription?.cancel_at_period_end && (
                      <span className="ml-1 text-orange-400"> · Скасовується в кінці періоду</span>
                    )}
                  </p>
                </div>
              </div>

              {!subscription?.cancel_at_period_end && (
                <>
                  {!showCancelConfirm ? (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="w-full py-2.5 px-4 bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all rounded-xl text-sm active:scale-95"
                    >
                      Скасувати підписку
                    </button>
                  ) : (
                    <div className="space-y-3 p-4 bg-white/5 border border-white/10 rounded-xl">
                      <p className="text-sm text-white/70">
                        Підписка буде активна до кінця оплаченого періоду. Ви впевнені?
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 py-2 px-4 bg-white/10 border border-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-all rounded-xl text-sm font-medium active:scale-95"
                        >
                          Ні, залишити
                        </button>
                        <button
                          onClick={handleCancelSubscription}
                          disabled={canceling}
                          className="flex-1 py-2 px-4 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-xl text-sm font-medium active:scale-95"
                        >
                          {canceling ? 'Скасування...' : 'Так, скасувати'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-white/50 text-sm">
                Активна підписка відсутня. Отримайте доступ до всіх функцій.
              </p>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-2">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/70">
                      <div className="shrink-0 w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                        <Check size={10} className="text-orange-400" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={buildLink(MONTHLY_LINK)}
                  className="block bg-white/10 border border-white/10 rounded-xl p-4 hover:bg-white/15 hover:border-white/20 transition-all group"
                >
                  <p className="text-white/50 text-xs mb-0.5">Щомісяця</p>
                  <p className="text-xl font-bold text-white mb-0.5">
                    €5<span className="text-sm font-normal text-white/50">/міс</span>
                  </p>
                  <p className="text-white/30 text-xs mb-3">30 днів безкоштовно</p>
                  <div className="w-full py-2 bg-white/10 border border-white/10 rounded-lg text-center text-xs text-white/80 group-hover:bg-white/20 transition-all">
                    Розпочати
                  </div>
                </a>
                <a
                  href={buildLink(YEARLY_LINK)}
                  className="block bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 hover:bg-orange-500/15 transition-all group relative"
                >
                  <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-semibold px-1.5 py-0.5 rounded-full">
                    -17%
                  </div>
                  <p className="text-white/50 text-xs mb-0.5">Щорічно</p>
                  <p className="text-xl font-bold text-white mb-0.5">
                    €50<span className="text-sm font-normal text-white/50">/рік</span>
                  </p>
                  <p className="text-white/30 text-xs mb-3">€4.17/міс &bull; 30 днів безкоштовно</p>
                  <div className="w-full py-2 bg-orange-500 rounded-lg text-center text-xs text-white font-medium group-hover:bg-orange-600 transition-all">
                    Розпочати
                  </div>
                </a>
              </div>
              <p className="text-center text-white/30 text-xs">
                Скасувати можна будь-коли. Безпечна оплата через Stripe.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <h2 className="text-lg font-medium text-white mb-4">
            {t('legal') || 'Правова інформація'}
          </h2>

          <Link
            to="/privacy"
            className="flex items-center justify-between py-3 border-b border-white/10 hover:bg-white/5 transition-colors rounded-lg px-2"
          >
            <span className="text-white">
              {t('privacyPolicy') || 'Політика конфіденційності'}
            </span>
            <span className="text-white/40">›</span>
          </Link>

          <Link
            to="/terms"
            className="flex items-center justify-between py-3 hover:bg-white/5 transition-colors rounded-lg px-2"
          >
            <span className="text-white">
              {t('termsOfService') || 'Умови використання'}
            </span>
            <span className="text-white/40">›</span>
          </Link>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full py-3 px-4 bg-white/10 backdrop-blur-xl border border-white/10 text-red-400 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/20 transition-all rounded-xl active:scale-95"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">{t('logout') || 'Вийти'}</span>
          </button>
        </div>

        <div className="bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <h2 className="text-lg font-medium text-red-400">
              {t('dangerZone') || 'Небезпечна зона'}
            </h2>
          </div>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-3 w-full py-3 px-4 bg-red-500/10 border border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-all rounded-xl active:scale-95"
            >
              <Trash2 className="h-5 w-5" />
              <span className="font-medium">{t('deleteAccount') || 'Видалити акаунт'}</span>
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white/60">
                {t('deleteAccountWarning') || 'Ця дія незворотна. Усі ваші дані (рахунки, клієнти, квитанції) будуть видалені назавжди.'}
              </p>
              <p className="text-sm text-white/80">
                {t('deleteAccountConfirmPrompt') || 'Введіть "delete" для підтвердження:'}
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder='delete'
                className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-red-500/50 text-sm"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                  className="flex-1 py-2.5 px-4 bg-white/10 border border-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-all rounded-xl text-sm font-medium active:scale-95"
                >
                  {t('cancel') || 'Скасувати'}
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText.toLowerCase() !== 'delete' || deleting}
                  className="flex-1 py-2.5 px-4 bg-red-500/80 hover:bg-red-500 disabled:bg-red-500/30 disabled:cursor-not-allowed text-white transition-all rounded-xl text-sm font-medium active:scale-95"
                >
                  {deleting ? (t('deleting') || 'Видалення...') : (t('deleteAccount') || 'Видалити акаунт')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
