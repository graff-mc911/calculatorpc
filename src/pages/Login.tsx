import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate('/');
    };
    checkSession();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Введіть email');
      return;
    }
    if (!password) {
      setError('Введіть пароль');
      return;
    }
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      if (data.session) navigate('/');
      else setError('Не вдалося увійти');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка входу';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-8"
      style={{ background: 'var(--cpc-page)' }}
    >
      <div className="w-full max-w-[360px] md:max-w-[420px] flex flex-col items-center">
        {/* Splash mark — visual spec */}
        <img
          src="/logo-cpc-full.jpg"
          alt="CPC Construction Project Calculator"
          className="w-[88%] max-w-[280px] md:max-w-[320px] rounded-[18px] object-contain mb-4"
          draggable={false}
        />
        <p
          className="text-[15px] md:text-[18px] font-medium text-center mb-1"
          style={{ color: 'var(--cpc-text)' }}
        >
          Construction Project Calculator
        </p>
        <p className="text-[12px] cpc-muted text-center mb-7">
          Калькулятор → рахунок на об&apos;єкті
        </p>

        <form onSubmit={handleLogin} autoComplete="on" className="w-full space-y-3">
          {error && (
            <div
              className="p-3 rounded-[12px] text-sm"
              style={{
                background: 'rgba(180,60,60,0.18)',
                border: '1px solid rgba(240,168,168,0.35)',
                color: '#f0a8a8',
              }}
            >
              {error}
            </div>
          )}

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full min-h-[48px] px-4 text-[15px] outline-none"
            style={{
              background: 'var(--cpc-card)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 12,
              color: 'var(--cpc-text)',
            }}
            required
          />

          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="w-full min-h-[48px] px-4 text-[15px] outline-none"
            style={{
              background: 'var(--cpc-card)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 12,
              color: 'var(--cpc-text)',
            }}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="cpc-btn-primary w-full min-h-[52px] text-[16px] font-semibold disabled:opacity-50"
          >
            {loading ? 'Завантаження…' : 'Увійти'}
          </button>
        </form>

        <p className="mt-6 text-sm cpc-muted text-center">
          Немає акаунта?{' '}
          <Link to="/signup" className="cpc-copper no-underline font-medium">
            Зареєструватися
          </Link>
        </p>
      </div>
    </div>
  );
};
