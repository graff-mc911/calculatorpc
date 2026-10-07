import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { supabase } from '../lib/supabase'

export const Login: React.FC = () => {
  const navigate = useNavigate()

  // ---------------------------
  // СТАНИ ФОРМИ
  // ---------------------------
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ---------------------------
  // ПЕРЕВІРКА СЕСІЇ
  // якщо користувач вже залогінений → редірект
  // ---------------------------
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate('/')
      }
    }

    checkSession()
  }, [navigate])

  // ---------------------------
  // ВХІД
  // ---------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Введіть email')
      return
    }

    if (!password) {
      setError('Введіть пароль')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) throw error

      if (data.session) {
        navigate('/')
      } else {
        setError('Не вдалося увійти')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка входу')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--cpc-bg)' }}>
      <Card className="w-full max-w-[360px] p-5">
        {/* Splash pattern from mockup 1a92 */}
        <div className="mb-6 flex flex-col items-center text-center gap-3">
          <img
            src="/logo-cpc-full.jpg"
            alt="CPC Construction Project Calculator"
            className="w-full rounded-[14px] object-cover max-h-48"
            draggable={false}
          />
          <p className="text-[12px] cpc-muted">Калькулятор → рахунок на об&apos;єкті</p>
        </div>

        {/* ---------------------------
            ФОРМА ВХОДУ
        --------------------------- */}
        <form onSubmit={handleLogin} autoComplete="on" className="space-y-5">
          {/* ---------------------------
              ПОМИЛКА
          --------------------------- */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* ---------------------------
              EMAIL
          --------------------------- */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-orange-500"
              required
            />
          </div>

          {/* ---------------------------
              PASSWORD
          --------------------------- */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              Пароль
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-orange-500"
              required
            />
          </div>

          {/* ---------------------------
              КНОПКА
          --------------------------- */}
          <button type="submit" disabled={loading} className="cpc-btn-primary w-full min-h-[44px]">
            {loading ? 'Завантаження...' : 'Увійти'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm cpc-muted">
            Немає акаунта?{' '}
            <Link to="/signup" className="cpc-copper">
              Зареєструватися
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}