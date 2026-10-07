import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Zap, ArrowLeft, Crown, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

type Plan = 'monthly' | 'yearly';

interface Subscription {
  status: string | null;
  plan: string | null;
  trial_end: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
}

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

const PRICING: Record<Plan, { title: string; price: string; suffix: string; note: string; badge?: string }> = {
  monthly: {
    title: 'Щомісяця',
    price: '€5',
    suffix: '/міс',
    note: '30 днів безкоштовно',
  },
  yearly: {
    title: 'Щорічно',
    price: '€50',
    suffix: '/рік',
    note: '€4.17/міс • 30 днів безкоштовно',
    badge: '-17%',
  },
};

export const Paywall: React.FC = () => {
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = React.useState<Plan | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: subscription, isLoading: subLoading } = useQuery<Subscription | null>({
    queryKey: ['subscription', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, plan, trial_end, cancel_at_period_end, current_period_end')
        .eq('user_id', session!.user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const hasAccess = subscription?.status === 'active' || subscription?.status === 'trialing';
  const trialEnds = subscription?.trial_end ? new Date(subscription.trial_end).toLocaleDateString('uk-UA') : null;

  const startCheckout = async (plan: Plan) => {
    setError(null);
    setLoadingPlan(plan);

    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        navigate('/login');
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'Не вдалося створити сесію оплати. Спробуйте ще раз.');
      }

      window.location.href = data.url as string;
    } catch (err: any) {
      setError(err.message ?? 'Сталася помилка. Спробуйте ще раз.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const renderPlanCard = (plan: Plan) => {
    const copy = PRICING[plan];
    const isCurrentPlan = hasAccess && subscription?.plan === plan;
    const buttonDisabled = loadingPlan === plan;

    return (
      <div
        key={plan}
        className={`relative block rounded-2xl p-6 transition-all backdrop-blur-xl border
        ${
          plan === 'yearly'
            ? 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/15'
            : 'bg-white/10 border-white/10 hover:bg-white/15 hover:border-white/20'
        }`}
      >
        {copy.badge && (
          <div className="absolute top-3 right-3 bg-orange-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            {copy.badge}
          </div>
        )}

        <p className="text-white/60 text-sm mb-1">{copy.title}</p>
        <p className="text-3xl font-bold text-white mb-1">
          {copy.price}
          <span className="text-lg font-normal text-white/60">{copy.suffix}</span>
        </p>
        <p className="text-white/40 text-xs mb-5">{copy.note}</p>

        <button
          disabled={buttonDisabled || hasAccess}
          onClick={() => startCheckout(plan)}
          className={`w-full py-2.5 rounded-xl text-center text-sm font-medium transition-all flex items-center justify-center gap-2
            ${
              plan === 'yearly'
                ? 'bg-orange-500 text-white hover:bg-orange-600 disabled:bg-orange-500/60 disabled:text-white/70'
                : 'bg-white/10 border border-white/10 text-white/80 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/50'
            }`}
        >
          {buttonDisabled && <Loader2 className="h-4 w-4 animate-spin" />}
          {hasAccess ? (isCurrentPlan ? 'Поточний план' : 'Доступ вже активний') : 'Розпочати'}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6 text-sm"
      >
        <ArrowLeft size={16} />
        Назад
      </button>

      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-orange-500/20 rounded-2xl mb-4">
          <Zap className="h-7 w-7 text-orange-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">CPC Pro</h1>
        <p className="text-white/60 text-base max-w-xl mx-auto">
          Отримайте доступ до всіх функцій. 30 днів безкоштовно — без прихованих платежів.
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-3 text-sm text-white/80">
              <div className="shrink-0 w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Check size={12} className="text-orange-400" />
              </div>
              {f}
            </li>
          ))}
        </ul>
      </div>

      {subLoading ? (
        <div className="flex items-center gap-2 text-white/70 text-sm mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Перевіряємо статус підписки...
        </div>
      ) : hasAccess ? (
        <div className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center text-green-400">
            <Crown className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-green-400 font-semibold text-sm">Доступ активний</p>
            <p className="text-white/60 text-sm">
              {subscription?.plan === 'yearly' ? 'Річний план' : 'Місячний план'}
              {subscription?.cancel_at_period_end && ' · Скасовується в кінці періоду'}
            </p>
            {trialEnds && <p className="text-white/40 text-xs mt-1">Пробний період до {trialEnds}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigate('/settings')}
                className="px-4 py-2 bg-white/10 border border-white/15 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                Керувати підпискою
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white transition-colors"
              >
                Перейти в додаток
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderPlanCard('monthly')}
        {renderPlanCard('yearly')}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
          {error}
        </div>
      )}

      <p className="text-center text-white/30 text-xs mt-6">
        Скасувати можна будь-коли. Безпечна оплата через Stripe.
      </p>
    </div>
  );
};