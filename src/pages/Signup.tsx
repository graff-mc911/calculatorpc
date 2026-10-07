import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/Logo'
import { supabase } from '../lib/supabase'

export const Signup: React.FC = () => {
  const navigate = useNavigate()

  // ---------------------------
  // СТАНИ ФОРМИ
  // ---------------------------
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
  // РЕЄСТРАЦІЯ
  // ---------------------------
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // перевірка паролів
    if (password !== confirmPassword) {
      setError('Паролі не співпадають')
      return
    }

    // мінімальна перевірка
    if (password.length < 6) {
      setError('Мінімум 6 символів')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (error) throw error

      // після реєстрації → на логін
      navigate('/login')
    } catch (err: any) {
      setError(err.message || 'Помилка реєстрації')
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
            Створити акаунт
          </p>
        </div>

        {/* ---------------------------
            ФОРМА
            ❗ autoComplete="on" важливо
        --------------------------- */}
        <form onSubmit={handleSignup} autoComplete="on" className="space-y-5">

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
              ❗ ВЗЯТО З Auth.jsx
              ❗ ключ = autoComplete="username"
          --------------------------- */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"   // ❗ ГОЛОВНЕ
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-orange-500"
              required
            />
          </div>

          {/* ---------------------------
              PASSWORD
              ❗ current-password щоб викликати менеджер паролів
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
              CONFIRM PASSWORD
              ❗ той самий autocomplete
          --------------------------- */}
          <div>
            <label className="block text-sm text-white/70 mb-2">
              Підтвердіть пароль
            </label>

            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="current-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-orange-500"
              required
            />
          </div>

          {/* ---------------------------
              КНОПКА
          --------------------------- */}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Завантаження...' : 'Зареєструватися'}
          </Button>
        </form>

        {/* ---------------------------
            ПЕРЕХІД НА LOGIN
        --------------------------- */}
        <div className="mt-6 text-center">
          <p className="text-sm text-white/60">
            Вже є акаунт?{' '}
            <Link to="/login" className="text-orange-400 hover:text-orange-300">
              Увійти
            </Link>
          </p>
        </div>

      </Card>
    </div>
  )
}