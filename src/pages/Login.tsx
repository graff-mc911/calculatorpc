import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/Logo'
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#1a1f24]">
      <Card className="w-full max-w-md p-8">
        {/* ---------------------------
            ЛОГО + ЗАГОЛОВОК
        --------------------------- */}
        <div className="mb-8 flex flex-col items-center">
          <Logo variant="full" size="lg" className="mb-6" />
          <p className="text-sm text-white/60">
            Увійти в акаунт
          </p>
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
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Завантаження...' : 'Увійти'}
          </Button>
        </form>

        {/* ---------------------------
            ПЕРЕХІД НА SIGNUP
        --------------------------- */}
        <div className="mt-6 text-center">
          <p className="text-sm text-white/60">
            Немає акаунта?{' '}
            <Link to="/signup" className="text-orange-400 hover:text-orange-300">
              Зареєструватися
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}