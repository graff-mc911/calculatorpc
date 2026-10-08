import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BookmarkPlus, Delete, Equal, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { evalFieldExpression } from '../lib/calculator';
import {
  CALC_UNITS,
  POPULAR_TEMPLATES,
  addCustomTemplate,
  loadCustomTemplates,
  removeCustomTemplate,
  unitToStorage,
  type CalcTemplate,
} from '../lib/calcTemplates';
import { formatCurrency, formatMoneyInput, formatQtyDisplay } from '../lib/moneyMask';
import {
  addWorkItem,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
} from '../lib/projectsApi';
import { supabase } from '../lib/supabase';

type ActiveField = 'qty' | 'price';

const KEYS: string[][] = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '%', '+'],
];

function formatTotal(n: number) {
  if (!Number.isFinite(n)) return '—';
  return formatCurrency(Math.round(n * 100) / 100, 'EUR').replace(/,00(?=\s)/, '');
}

export default function Calculator() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useToastContext();

  const [title, setTitle] = useState('Штукатурка');
  const [unit, setUnit] = useState('m²');
  const [qtyDisplay, setQtyDisplay] = useState('150');
  const [priceDisplay, setPriceDisplay] = useState('25');
  const [activeField, setActiveField] = useState<ActiveField>('qty');
  const [customTemplates, setCustomTemplates] = useState<CalcTemplate[]>(() => loadCustomTemplates());
  const [projectSheet, setProjectSheet] = useState(false);
  const [catalogId, setCatalogId] = useState<string | null>('work-gypsum-plaster');
  const [category, setCategory] = useState('plaster');

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: listProjects,
    retry: false,
  });

  const qty = useMemo(() => evalFieldExpression(qtyDisplay), [qtyDisplay]);
  const price = useMemo(() => evalFieldExpression(priceDisplay), [priceDisplay]);
  const total =
    qty != null && price != null && Number.isFinite(qty) && Number.isFinite(price)
      ? qty * price
      : NaN;

  const setActiveValue = (updater: (prev: string) => string) => {
    if (activeField === 'qty') setQtyDisplay(updater);
    else setPriceDisplay(updater);
  };

  const commitActive = () => {
    const raw = activeField === 'qty' ? qtyDisplay : priceDisplay;
    const n = evalFieldExpression(raw);
    if (n == null) return;
    if (activeField === 'qty') setQtyDisplay(formatQtyDisplay(n));
    else setPriceDisplay(formatMoneyInput(n, 2));
  };

  const onKey = (key: string) => {
    if (key === 'C') {
      setActiveValue(() => '');
      return;
    }
    if (key === '⌫') {
      setActiveValue((p) => p.slice(0, -1));
      return;
    }
    if (key === '=') {
      commitActive();
      return;
    }
    setActiveValue((p) => {
      // Replace plain result when starting a new digit after commit
      if (p === '0' && key >= '0' && key <= '9') return key;
      return p + key;
    });
  };

  const applyTemplate = (tpl: CalcTemplate) => {
    setTitle(tpl.title);
    setUnit(tpl.unit);
    setPriceDisplay(formatMoneyInput(tpl.price, 2));
    setCatalogId(tpl.catalogWorkId || null);
    setCategory(tpl.category || 'other');
    setActiveField('qty');
  };

  const saveAsTemplate = () => {
    if (!title.trim()) {
      showError('Вкажіть назву роботи');
      return;
    }
    const p = evalFieldExpression(priceDisplay) ?? 0;
    const tpl = addCustomTemplate({ title: title.trim(), unit, price: p });
    setCustomTemplates(loadCustomTemplates());
    showSuccess(`Шаблон «${tpl.title}» збережено`);
  };

  const addMut = useMutation({
    mutationFn: async (projectId: string) => {
      const q = evalFieldExpression(qtyDisplay);
      const p = evalFieldExpression(priceDisplay);
      if (!title.trim()) throw new Error('NO_TITLE');
      if (q == null || p == null) throw new Error('INVALID');
      return addWorkItem({
        project_id: projectId,
        title: title.trim(),
        category,
        catalog_work_id: catalogId,
        quantity: q,
        unit: unitToStorage(unit),
        unit_price: p,
      });
    },
    onSuccess: (_item, projectId) => {
      showSuccess('Роботу додано до об’єкта');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-bundle', projectId] });
      qc.invalidateQueries({ queryKey: ['projects-work-summary'] });
      setProjectSheet(false);
      navigate(`/projects/${projectId}`);
    },
    onError: (err) => {
      if (err instanceof ProjectsSchemaMissingError) {
        showError(t('projectsSchemaMissing') || 'Apply projects migration');
        return;
      }
      if (err instanceof Error && err.message === 'NO_TITLE') {
        showError('Вкажіть назву роботи');
        return;
      }
      showError('Не вдалося додати. Перевірте кількість і ціну.');
    },
  });

  const onAddToProject = () => {
    const list = projects as Project[];
    if (list.length === 0) {
      showError('Спочатку створіть об’єкт');
      navigate('/projects');
      return;
    }
    if (list.length === 1) {
      addMut.mutate(list[0].id);
      return;
    }
    setProjectSheet(true);
  };

  const allTemplates = [...POPULAR_TEMPLATES, ...customTemplates];

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 pb-4">
      <h1 className="text-xl font-medium mb-3" style={{ color: 'var(--cpc-text)' }}>
        Калькулятор
      </h1>

      {/* Templates */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <span className="cpc-muted text-[11px]">Шаблони</span>
          <button
            type="button"
            onClick={saveAsTemplate}
            className="inline-flex items-center gap-1 text-[11px] min-h-[32px] bg-transparent border-0 cpc-copper"
          >
            <BookmarkPlus size={13} /> Зберегти шаблон
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl)}
              onContextMenu={(e) => {
                if (!tpl.custom) return;
                e.preventDefault();
                if (window.confirm(`Видалити шаблон «${tpl.title}»?`)) {
                  removeCustomTemplate(tpl.id);
                  setCustomTemplates(loadCustomTemplates());
                }
              }}
              className="min-h-[36px] px-2.5 text-[12px] font-medium"
              style={{
                background:
                  title === tpl.title ? 'rgba(200,121,74,0.22)' : 'var(--cpc-card)',
                border: `1px solid ${
                  title === tpl.title ? 'rgba(224,151,95,0.45)' : 'var(--cpc-line)'
                }`,
                borderRadius: 9,
                color: title === tpl.title ? 'var(--cpc-copper-light)' : 'var(--cpc-text)',
              }}
            >
              {tpl.title}
              {tpl.custom ? ' ★' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Main form */}
      <div className="cpc-card mb-3 space-y-3">
        <div>
          <label className="cpc-card-label mb-1">Назва роботи</label>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setCatalogId(null);
              setCategory('other');
            }}
            className="w-full min-h-[48px] text-[16px] px-3 bg-transparent outline-none"
            style={{
              background: 'var(--cpc-bg)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 10,
              color: 'var(--cpc-text)',
            }}
            placeholder="Штукатурка"
          />
        </div>

        {/* Units */}
        <div>
          <label className="cpc-card-label mb-1">Одиниця</label>
          <div className="flex flex-wrap gap-1.5">
            {CALC_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className="min-h-[40px] min-w-[44px] px-2.5 text-[13px] font-medium"
                style={{
                  background: unit === u ? 'var(--cpc-copper)' : 'var(--cpc-bg)',
                  color: unit === u ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                  border: `1px solid ${unit === u ? 'var(--cpc-copper)' : 'var(--cpc-line)'}`,
                  borderRadius: 9,
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Qty + Price */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveField('qty')}
            className="text-left p-3 min-h-[72px]"
            style={{
              background: 'var(--cpc-bg)',
              border: `2px solid ${
                activeField === 'qty' ? 'var(--cpc-copper)' : 'var(--cpc-line)'
              }`,
              borderRadius: 12,
            }}
          >
            <span className="cpc-card-label">Кількість</span>
            <b
              className="block text-[22px] font-medium tabular-nums mt-0.5 truncate"
              style={{ color: 'var(--cpc-text)' }}
            >
              {qtyDisplay || '0'}
            </b>
          </button>
          <button
            type="button"
            onClick={() => setActiveField('price')}
            className="text-left p-3 min-h-[72px]"
            style={{
              background: 'var(--cpc-bg)',
              border: `2px solid ${
                activeField === 'price' ? 'var(--cpc-copper)' : 'var(--cpc-line)'
              }`,
              borderRadius: 12,
            }}
          >
            <span className="cpc-card-label">Ціна за од., €</span>
            <b
              className="block text-[22px] font-medium tabular-nums mt-0.5 truncate"
              style={{ color: 'var(--cpc-text)' }}
            >
              {priceDisplay || '0'}
            </b>
          </button>
        </div>

        {/* Total */}
        <div
          className="flex items-end justify-between px-1 pt-1"
          style={{ borderTop: '1px solid var(--cpc-line)' }}
        >
          <div>
            <span className="cpc-card-label">TOTAL</span>
            <b className="block text-[28px] font-semibold tabular-nums cpc-copper leading-tight">
              {formatTotal(total)}
            </b>
          </div>
          <span className="cpc-muted text-[12px] pb-1">
            {qtyDisplay || '0'} {unit} × {priceDisplay || '0'} €
          </span>
        </div>
      </div>

      {/* Keypad */}
      <div className="mb-3">
        <p className="cpc-muted text-[11px] mb-1.5 px-0.5">
          Клавіатура · {activeField === 'qty' ? 'кількість' : 'ціна'} · 100-15% · 25*4
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {KEYS.flat().map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onKey(k)}
              className="min-h-[52px] text-[20px] font-medium active:scale-[0.97] transition-transform"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 12,
                color: /[+\-*/%]/.test(k) ? 'var(--cpc-copper-light)' : 'var(--cpc-text)',
              }}
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onKey('C')}
            className="min-h-[52px] text-[15px] font-medium"
            style={{
              background: 'var(--cpc-card)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 12,
              color: 'var(--cpc-muted)',
            }}
          >
            C
          </button>
          <button
            type="button"
            onClick={() => onKey('⌫')}
            className="min-h-[52px] flex items-center justify-center"
            style={{
              background: 'var(--cpc-card)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 12,
              color: 'var(--cpc-muted)',
            }}
            aria-label="Backspace"
          >
            <Delete size={20} />
          </button>
          <button
            type="button"
            onClick={() => onKey('=')}
            className="col-span-2 min-h-[52px] flex items-center justify-center gap-1 text-[18px] font-medium"
            style={{
              background: 'rgba(200,121,74,0.22)',
              border: '1px solid rgba(224,151,95,0.4)',
              borderRadius: 12,
              color: 'var(--cpc-copper-light)',
            }}
          >
            <Equal size={20} /> =
          </button>
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onAddToProject}
        disabled={addMut.isPending || !title.trim() || !Number.isFinite(total)}
        className="cpc-btn-primary w-full min-h-[56px] text-[16px] font-medium disabled:opacity-40"
      >
        {addMut.isPending ? 'Додаємо…' : 'Додати до об’єкта'}
      </button>

      <AnimatePresence>
        {projectSheet && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-2 pb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProjectSheet(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] max-h-[70vh] overflow-y-auto p-4"
              style={{
                background: 'var(--cpc-card)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 16,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold" style={{ color: 'var(--cpc-text)' }}>
                  Обрати об’єкт
                </h2>
                <button
                  type="button"
                  onClick={() => setProjectSheet(false)}
                  className="w-10 h-10 bg-transparent border-0"
                  style={{ color: 'var(--cpc-muted)' }}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-1.5">
                {(projects as Project[]).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={addMut.isPending}
                    onClick={() => addMut.mutate(p.id)}
                    className="w-full text-left min-h-[52px] px-3 py-2"
                    style={{
                      background: 'var(--cpc-bg)',
                      border: '1px solid var(--cpc-line)',
                      borderRadius: 10,
                      color: 'var(--cpc-text)',
                    }}
                  >
                    <b className="block text-[14px] font-medium truncate">{p.name}</b>
                    {p.client_name && (
                      <span className="cpc-muted text-[12px]">{p.client_name}</span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
