import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calculator,
  FileText,
  Users,
  Receipt,
  Camera,
  Smartphone,
  BarChart3,
  CheckCircle,
  Globe,
  ArrowRight,
  Zap,
  Shield,
  Star,
} from 'lucide-react';
import { Logo } from '../components/Logo';

const features = [
  {
    icon: Calculator,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/15',
    title: 'Швидкий калькулятор будівельних робіт',
    desc: "Розраховуйте площу, об\u2019єм, матеріали та вартість за секунди. Вводите дані — одразу бачите результат (Netto, ПДВ, Brutto).",
  },
  {
    icon: FileText,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/15',
    title: 'Створення професійних рахунків',
    desc: 'Генеруйте інвойси у сучасному міжнародному форматі. 24 мови інтерфейсу та 21 валюта. PDF-файли миттєво створюються, зберігаються та відправляються.',
  },
  {
    icon: Users,
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/15',
    title: 'Управління клієнтами',
    desc: 'Зберігайте контакти, історію робіт та швидко створюйте рахунки без повторного введення даних.',
  },
  {
    icon: Receipt,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/15',
    title: 'Управління документами та витратами',
    desc: 'Зберігайте чеки у форматі PDF. До кожного рахунку додайте чек за матеріали для повної фінансової прозорості.',
  },
  {
    icon: Camera,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/15',
    title: 'Сканер документів',
    desc: 'Фотографуйте чеки, рахунки або документи — і додавайте їх до інвойсів або проектів одним дотиком.',
  },
  {
    icon: Smartphone,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/15',
    title: 'Робота прямо на об\'єкті',
    desc: 'Інтерфейс адаптований для телефону: швидкий доступ, мінімум кліків, зручний у використанні навіть у польових умовах.',
  },
];

const benefits = [
  'Простий і зрозумілий інтерфейс',
  'Працює швидко навіть на об\'єкті',
  'Професійний вигляд документів',
  'Економить час щодня',
  'Не потребує навчання',
  'Повний контроль над бізнесом',
];

const stats = [
  { value: '24', label: 'мови інтерфейсу', icon: Globe },
  { value: '21', label: 'валюта', icon: BarChart3 },
  { value: '100%', label: 'мобільний', icon: Smartphone },
  { value: 'PDF', label: 'документи', icon: FileText },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: [0.4, 0, 0.2, 1] },
  }),
};

export const Landing: React.FC = () => {
  return (
    <div className="min-h-screen text-white">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-4 bg-black/20 backdrop-blur-xl border-b border-white/5">
        <Logo variant="glass" size="sm" />
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-white/70 hover:text-white text-sm font-medium transition-colors px-3 py-1.5"
          >
            Увійти
          </Link>
          <Link
            to="/signup"
            className="bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all active:scale-95"
          >
            Спробувати
          </Link>
        </div>
      </header>

      <section className="relative pt-32 pb-20 px-5 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-orange-500/10 rounded-full blur-[100px]" />
          <div className="absolute top-[20%] left-[10%] w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/15 border border-orange-500/25 rounded-full text-orange-300 text-xs font-medium mb-6"
          >
            <Zap size={12} />
            Для будівельників, майстрів та підрядників
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-6 tracking-tight"
          >
            CPC
            <span className="block text-white/90 text-2xl sm:text-3xl md:text-4xl font-semibold mt-2">Construction Project Calculator</span>
            <span className="block text-orange-400 mt-1">Ваш інструмент</span>
            <span className="block text-white/80 text-3xl sm:text-4xl md:text-5xl font-semibold mt-2">на кожному об'єкті</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-white/60 text-lg leading-relaxed mb-10 max-w-2xl mx-auto"
          >
            Сучасний інструмент для будівельників, майстрів і невеликих компаній — швидко розраховуйте об'єкти, створюйте рахунки та керуйте клієнтами прямо зі смартфона.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link
              to="/signup"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-semibold px-8 py-4 rounded-2xl transition-all active:scale-95 text-base shadow-lg shadow-orange-500/25"
            >
              Розпочати безкоштовно
              <ArrowRight size={18} />
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 text-white font-medium px-8 py-4 rounded-2xl transition-all text-base"
            >
              Увійти в акаунт
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-white/30 text-xs mt-5"
          >
            Забудьте про Excel, папери та складні програми
          </motion.p>
        </div>
      </section>

      <section className="py-10 px-5 border-y border-white/5">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center"
            >
              <stat.icon size={20} className="text-orange-400 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold text-white">{stat.value}</p>
              <p className="text-white/40 text-sm mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="py-20 px-5">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <p className="text-orange-400 text-sm font-medium uppercase tracking-widest mb-3">Можливості</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Що ви отримуєте</h2>
            <p className="text-white/50 text-base max-w-xl mx-auto">
              Всі інструменти для ефективної роботи на будівельному майданчику — в одному додатку
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className={`p-5 rounded-2xl bg-white/5 border ${f.bg} backdrop-blur-sm hover:bg-white/8 transition-all`}
              >
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-4 border`}>
                  <f.icon size={20} className={f.color} />
                </div>
                <h3 className="text-white font-semibold text-sm mb-2 leading-snug">{f.title}</h3>
                <p className="text-white/50 text-xs leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-orange-400 text-sm font-medium uppercase tracking-widest mb-3">Переваги</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Чому обирають CPC</h2>
              <p className="text-white/50 text-base mb-8 leading-relaxed">
                Construction Project Calculator (CPC) — це не просто калькулятор. Це ваш щоденний інструмент для роботи, який допомагає заробляти більше і працювати швидше.
              </p>
              <div className="space-y-3">
                {benefits.map((b, i) => (
                  <motion.div
                    key={b}
                    custom={i}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                    className="flex items-center gap-3"
                  >
                    <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                    <span className="text-white/80 text-sm">{b}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4"
            >
              <div className="flex items-center gap-3 p-4 bg-orange-500/10 border border-orange-500/15 rounded-2xl">
                <BarChart3 size={20} className="text-orange-400 flex-shrink-0" />
                <div>
                  <p className="text-white font-semibold text-sm">Повний контроль</p>
                  <p className="text-white/50 text-xs mt-0.5">Всі витрати, доходи та документи зібрані в одному місці</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/15 rounded-2xl">
                <Globe size={20} className="text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-white font-semibold text-sm">Міжнародний формат</p>
                  <p className="text-white/50 text-xs mt-0.5">Інвойси підходять для роботи у будь-якій країні</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-cyan-500/10 border border-cyan-500/15 rounded-2xl">
                <Shield size={20} className="text-cyan-400 flex-shrink-0" />
                <div>
                  <p className="text-white font-semibold text-sm">Безпека даних</p>
                  <p className="text-white/50 text-xs mt-0.5">Ваші дані зберігаються безпечно у хмарі</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/15 rounded-2xl">
                <Star size={20} className="text-yellow-400 flex-shrink-0" />
                <div>
                  <p className="text-white font-semibold text-sm">Регулярні оновлення</p>
                  <p className="text-white/50 text-xs mt-0.5">Постійно вдосконалюємо додаток на основі відгуків</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-20 px-5">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative bg-gradient-to-br from-orange-500/15 to-orange-600/5 border border-orange-500/20 rounded-3xl p-8 sm:p-12 text-center overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-[-30%] right-[-10%] w-[250px] h-[250px] bg-orange-500/10 rounded-full blur-[60px]" />
            </div>
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Готові розпочати?
              </h2>
              <p className="text-white/60 text-base mb-8 max-w-xl mx-auto leading-relaxed">
                Створіть акаунт безкоштовно та отримайте доступ до всіх інструментів для ефективної роботи на об'єкті
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/signup"
                  className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-semibold px-8 py-4 rounded-2xl transition-all active:scale-95 text-base shadow-lg shadow-orange-500/25"
                >
                  Створити акаунт
                  <ArrowRight size={18} />
                </Link>
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 text-white font-medium px-8 py-4 rounded-2xl transition-all text-base"
                >
                  Вже є акаунт
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="py-8 px-5 border-t border-white/5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo variant="glass" size="sm" />
          <p className="text-white/30 text-xs text-center">
            Construction Project Calculator (CPC)
          </p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="text-white/30 hover:text-white/60 text-xs transition-colors">Конфіденційність</Link>
            <Link to="/terms" className="text-white/30 hover:text-white/60 text-xs transition-colors">Умови</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
