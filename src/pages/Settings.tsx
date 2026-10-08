import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  LogOut,
  Moon,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import {
  formatInvoiceNumber,
  loadCpcSettings,
  saveCpcSettings,
  type CpcAppSettings,
  type CpcCurrency,
} from '../lib/cpcSettings';
import {
  exportClientsToCSV,
  exportInvoicesToCSV,
  exportToJSON,
} from '../lib/exportData';
import { languages } from '../lib/languages';
import { supabase } from '../lib/supabase';

type ProfileForm = {
  company_name: string;
  phone: string;
  email: string;
  address: string;
  tax_number: string;
  bank_name: string;
  iban: string;
  bic: string;
  logo_url: string;
  logo_path: string;
};

const EMPTY_PROFILE: ProfileForm = {
  company_name: '',
  phone: '',
  email: '',
  address: '',
  tax_number: '',
  bank_name: '',
  iban: '',
  bic: '',
  logo_url: '',
  logo_path: '',
};

const LANG_CODES = ['uk', 'en', 'de'] as const;
const CURRENCIES: CpcCurrency[] = ['EUR', 'UAH', 'USD'];

const fieldStyle: React.CSSProperties = {
  background: 'var(--cpc-bg)',
  border: '1px solid var(--cpc-line)',
  borderRadius: 10,
  color: 'var(--cpc-text)',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2
        className="text-[11px] font-semibold tracking-[0.08em] uppercase mb-2 px-0.5"
        style={{ color: 'var(--cpc-muted)' }}
      >
        {title}
      </h2>
      <div className="cpc-card space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="cpc-card-label mb-1 block">{label}</label>
      {children}
    </div>
  );
}

async function uploadLogo(
  userId: string,
  file: File,
  previousPath?: string
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const safeExt = ext === 'jpeg' ? 'jpg' : ext;
  const storagePath = `${userId}/logo-${Date.now()}.${safeExt}`;
  if (previousPath) {
    await supabase.storage.from('company-logos').remove([previousPath]);
  }
  const { error } = await supabase.storage.from('company-logos').upload(storagePath, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const {
    data: { publicUrl },
  } = supabase.storage.from('company-logos').getPublicUrl(storagePath);
  return { publicUrl, storagePath };
}

export default function Settings() {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();
  const logoRef = useRef<HTMLInputElement>(null);

  const [prefs, setPrefs] = useState<CpcAppSettings>(() => loadCpcSettings());
  const [profile, setProfile] = useState<ProfileForm>({ ...EMPTY_PROFILE });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: profileRow, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_profile')
        .select('*')
        .eq('user_id', session!.user.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!profileRow) {
      setProfile({ ...EMPTY_PROFILE });
      return;
    }
    setProfile({
      company_name: profileRow.company_name || '',
      phone: profileRow.phone || '',
      email: profileRow.email || '',
      address: profileRow.address || '',
      tax_number: profileRow.tax_number || '',
      bank_name: profileRow.bank_name || '',
      iban: profileRow.iban || '',
      bic: profileRow.bic || '',
      logo_url: profileRow.logo_url || '',
      logo_path: profileRow.logo_path || '',
    });
  }, [profileRow]);

  const { data: lastInvoiceNo } = useQuery({
    queryKey: ['last-invoice-no', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('document_no')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.document_no || null;
    },
  });

  const nextPreview = useMemo(() => {
    let next = 1;
    if (lastInvoiceNo) {
      const m = String(lastInvoiceNo).match(/\d+$/);
      if (m) next = parseInt(m[0], 10) + 1;
    }
    return formatInvoiceNumber(prefs, next);
  }, [lastInvoiceNo, prefs]);

  const saveBusiness = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error('Не авторизовано');
      saveCpcSettings(prefs);
      const payload = {
        company_name: profile.company_name.trim(),
        phone: profile.phone.trim(),
        email: profile.email.trim().toLowerCase(),
        address: profile.address.trim(),
        tax_number: profile.tax_number.trim(),
        bank_name: profile.bank_name.trim(),
        iban: profile.iban.trim(),
        bic: profile.bic.trim(),
        logo_url: profile.logo_url,
        logo_path: profile.logo_path,
        user_id: session.user.id,
        updated_at: new Date().toISOString(),
      };
      if (profileRow) {
        const { error } = await supabase
          .from('company_profile')
          .update(payload)
          .eq('user_id', session.user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('company_profile').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      showSuccess('Збережено');
    },
    onError: (e: Error) => showError(e.message || 'Не вдалося зберегти'),
  });

  const saveDocsAndApp = () => {
    saveCpcSettings(prefs);
    showSuccess('Збережено');
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;
    if (!file.type.startsWith('image/')) {
      showError('Лише зображення');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('Макс. 2 МБ');
      return;
    }
    setUploadingLogo(true);
    try {
      const { publicUrl, storagePath } = await uploadLogo(
        session.user.id,
        file,
        profile.logo_path || undefined
      );
      setProfile((p) => ({
        ...p,
        logo_url: publicUrl,
        logo_path: storagePath,
      }));
      showSuccess('Логотип завантажено — натисніть Зберегти');
    } catch (err: any) {
      showError(err?.message || 'Помилка завантаження');
    } finally {
      setUploadingLogo(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  const handleExportCsv = async () => {
    if (!session?.user?.id) return;
    setExporting(true);
    try {
      const [inv, cli] = await Promise.all([
        supabase.from('invoices').select('*').eq('user_id', session.user.id),
        supabase.from('clients').select('*').eq('user_id', session.user.id),
      ]);
      if (inv.error) throw inv.error;
      if (cli.error) throw cli.error;
      exportInvoicesToCSV(inv.data || []);
      exportClientsToCSV(cli.data || []);
      showSuccess('CSV завантажено');
    } catch (e: any) {
      showError(e?.message || 'Експорт не вдався');
    } finally {
      setExporting(false);
    }
  };

  const handleBackup = async () => {
    if (!session?.user?.id) return;
    setExporting(true);
    try {
      const uid = session.user.id;
      const [inv, cli, rec, prof, projects] = await Promise.all([
        supabase.from('invoices').select('*').eq('user_id', uid),
        supabase.from('clients').select('*').eq('user_id', uid),
        supabase.from('receipts').select('*').eq('user_id', uid),
        supabase.from('company_profile').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('projects').select('*').eq('user_id', uid),
      ]);
      const backup = {
        exported_at: new Date().toISOString(),
        app_settings: loadCpcSettings(),
        company_profile: prof.data || null,
        clients: cli.data || [],
        invoices: inv.data || [],
        receipts: rec.error ? [] : rec.data || [],
        projects: projects.error ? [] : projects.data || [],
      };
      exportToJSON([backup], `cpc-backup_${new Date().toISOString().split('T')[0]}`);
      showSuccess('Backup збережено');
    } catch (e: any) {
      showError(e?.message || 'Backup не вдався');
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleDelete = async () => {
    if (deleteText.toLowerCase() !== 'delete') return;
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
      showError('Не вдалося видалити');
    }
  };

  const langOptions = languages.filter((l) =>
    (LANG_CODES as readonly string[]).includes(l.code)
  );

  return (
    <div className="cpc-page px-3 w-full max-w-[430px] mx-auto min-w-0 pb-8">
      <h1 className="text-xl font-medium mb-1" style={{ color: 'var(--cpc-text)' }}>
        Налаштування
      </h1>
      <p className="cpc-muted text-[13px] mb-4">
        Бізнес, рахунки, додаток — коротко і по суті
      </p>

      {/* BUSINESS */}
      <Section title="Business · Бізнес">
        {profileLoading ? (
          <div className="h-24 animate-pulse rounded-lg" style={{ background: 'var(--cpc-bg)' }} />
        ) : (
          <>
            <Field label="Ім’я">
              <input
                value={prefs.ownerName}
                onChange={(e) => setPrefs({ ...prefs, ownerName: e.target.value })}
                placeholder="Ваше ім’я"
                className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                style={fieldStyle}
                autoComplete="name"
              />
            </Field>
            <Field label="Компанія">
              <input
                value={profile.company_name}
                onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                placeholder="ФОП / ТОВ"
                className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                style={fieldStyle}
              />
            </Field>
            <Field label="Телефон">
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+49 …"
                className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                style={fieldStyle}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="name@email.com"
                className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                style={fieldStyle}
              />
            </Field>
            <Field label="Адреса">
              <textarea
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="Вулиця, місто"
                rows={2}
                className="w-full text-[15px] px-3 py-2.5 outline-none resize-none"
                style={fieldStyle}
              />
            </Field>
            <Field label="VAT number">
              <input
                value={profile.tax_number}
                onChange={(e) => setProfile({ ...profile, tax_number: e.target.value })}
                placeholder="ПДВ / ЄДРПОУ / USt-IdNr"
                className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                style={fieldStyle}
              />
            </Field>
            <Field label={t('bankDetails') || 'Банківські реквізити'}>
              <input
                value={profile.iban}
                onChange={(e) => setProfile({ ...profile, iban: e.target.value })}
                placeholder="IBAN"
                className="w-full min-h-[44px] text-[15px] px-3 outline-none mb-2"
                style={fieldStyle}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={profile.bank_name}
                  onChange={(e) => setProfile({ ...profile, bank_name: e.target.value })}
                  placeholder="Банк"
                  className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                  style={fieldStyle}
                />
                <input
                  value={profile.bic}
                  onChange={(e) => setProfile({ ...profile, bic: e.target.value })}
                  placeholder="BIC / SWIFT"
                  className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                  style={fieldStyle}
                />
              </div>
            </Field>
            <button
              type="button"
              onClick={() => saveBusiness.mutate()}
              disabled={saveBusiness.isPending || !session?.user?.id}
              className="cpc-btn-primary w-full min-h-[48px] disabled:opacity-40"
            >
              {saveBusiness.isPending ? 'Зберігаємо…' : 'Зберегти бізнес'}
            </button>
          </>
        )}
      </Section>

      {/* DOCUMENTS */}
      <Section title="Documents · Документи">
        <Field label="Logo">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: 'var(--cpc-bg)',
                border: '1px solid var(--cpc-line)',
                borderRadius: 10,
              }}
            >
              {profile.logo_url ? (
                <img
                  src={profile.logo_url}
                  alt="Logo"
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <Upload size={18} style={{ color: 'var(--cpc-muted)' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onLogo}
              />
              <button
                type="button"
                onClick={() => logoRef.current?.click()}
                disabled={uploadingLogo}
                className="min-h-[40px] px-3 text-[13px] font-medium"
                style={{
                  background: 'var(--cpc-bg)',
                  border: '1px solid var(--cpc-line)',
                  borderRadius: 9,
                  color: 'var(--cpc-copper-light)',
                }}
              >
                {uploadingLogo ? 'Завантаження…' : profile.logo_url ? 'Змінити' : 'Додати логотип'}
              </button>
              <p className="cpc-muted text-[11px] mt-1">На рахунках PDF</p>
            </div>
          </div>
        </Field>

        <Field label="Invoice prefix">
          <input
            value={prefs.invoicePrefix}
            onChange={(e) =>
              setPrefs({ ...prefs, invoicePrefix: e.target.value.toUpperCase().slice(0, 12) })
            }
            placeholder="INV"
            className="w-full min-h-[44px] text-[15px] px-3 outline-none"
            style={fieldStyle}
          />
        </Field>

        <Field label="Invoice numbering">
          <label className="flex items-center gap-2 min-h-[40px] text-[13px]" style={{ color: 'var(--cpc-text)' }}>
            <input
              type="checkbox"
              checked={prefs.invoiceIncludeYear}
              onChange={(e) => setPrefs({ ...prefs, invoiceIncludeYear: e.target.checked })}
            />
            Включати рік
          </label>
          <p className="cpc-muted text-[12px] mt-1">
            Наступний: <span className="tabular-nums" style={{ color: 'var(--cpc-copper-light)' }}>{nextPreview}</span>
          </p>
        </Field>

        <Field label="Payment terms">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={365}
              value={prefs.paymentTermsDays}
              onChange={(e) =>
                setPrefs({ ...prefs, paymentTermsDays: Number(e.target.value) || 0 })
              }
              className="w-24 min-h-[44px] text-[15px] px-3 outline-none tabular-nums"
              style={fieldStyle}
            />
            <span className="cpc-muted text-[13px]">днів на оплату</span>
          </div>
        </Field>

        <Field label="VAT %">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={prefs.defaultVatPercent}
              onChange={(e) =>
                setPrefs({ ...prefs, defaultVatPercent: Number(e.target.value) || 0 })
              }
              className="w-24 min-h-[44px] text-[15px] px-3 outline-none tabular-nums"
              style={fieldStyle}
            />
            <span className="cpc-muted text-[13px]">для нових рахунків</span>
          </div>
        </Field>

        <button
          type="button"
          onClick={() => {
            saveCpcSettings(prefs);
            saveBusiness.mutate();
          }}
          disabled={saveBusiness.isPending}
          className="cpc-btn-primary w-full min-h-[48px] disabled:opacity-40"
        >
          Зберегти документи
        </button>
      </Section>

      {/* APP */}
      <Section title="App · Додаток">
        <Field label="Language">
          <div className="flex gap-1.5">
            {langOptions.map((lang) => {
              const active = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className="flex-1 min-h-[44px] text-[13px] font-medium"
                  style={{
                    background: active ? 'var(--cpc-copper)' : 'var(--cpc-bg)',
                    color: active ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                    border: `1px solid ${active ? 'var(--cpc-copper)' : 'var(--cpc-line)'}`,
                    borderRadius: 10,
                  }}
                >
                  {lang.code.toUpperCase()}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Currency">
          <div className="flex gap-1.5">
            {CURRENCIES.map((c) => {
              const active = prefs.currency === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const next = { ...prefs, currency: c };
                    setPrefs(next);
                    saveCpcSettings(next);
                  }}
                  className="flex-1 min-h-[44px] text-[13px] font-medium tabular-nums"
                  style={{
                    background: active ? 'var(--cpc-copper)' : 'var(--cpc-bg)',
                    color: active ? 'var(--cpc-on-copper)' : 'var(--cpc-text)',
                    border: `1px solid ${active ? 'var(--cpc-copper)' : 'var(--cpc-line)'}`,
                    borderRadius: 10,
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex items-center justify-between gap-3 min-h-[48px]">
          <div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--cpc-text)' }}>
              Theme
            </p>
            <p className="cpc-muted text-[12px]">{isDark ? 'Темна' : 'Світла'}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsDark((v) => !v)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-[13px]"
            style={{
              background: 'var(--cpc-bg)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 10,
              color: 'var(--cpc-copper-light)',
            }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
            {isDark ? 'Світла' : 'Темна'}
          </button>
        </div>

        <button
          type="button"
          onClick={saveDocsAndApp}
          className="cpc-btn-primary w-full min-h-[44px]"
        >
          Зберегти додаток
        </button>
      </Section>

      {/* DATA */}
      <Section title="Data · Дані">
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="w-full min-h-[48px] flex items-center justify-between px-1 text-left bg-transparent border-0"
          style={{ color: 'var(--cpc-text)' }}
        >
          <span className="inline-flex items-center gap-2 text-[14px]">
            <Download size={16} className="cpc-copper" />
            Export data
          </span>
          <span className="cpc-muted text-[12px]">CSV</span>
        </button>

        <div style={{ borderTop: '1px solid var(--cpc-line)' }} />

        <button
          type="button"
          onClick={handleBackup}
          disabled={exporting}
          className="w-full min-h-[48px] flex items-center justify-between px-1 text-left bg-transparent border-0"
          style={{ color: 'var(--cpc-text)' }}
        >
          <span className="inline-flex items-center gap-2 text-[14px]">
            <Download size={16} className="cpc-copper" />
            Backup
          </span>
          <span className="cpc-muted text-[12px]">JSON</span>
        </button>

        <div style={{ borderTop: '1px solid var(--cpc-line)' }} />

        <div className="pt-1">
          <p className="cpc-card-label mb-1">Account</p>
          <p className="text-[13px] mb-3 truncate" style={{ color: 'var(--cpc-text)' }}>
            {session?.user?.email || '—'}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-medium mb-2"
            style={{
              background: 'var(--cpc-bg)',
              border: '1px solid var(--cpc-line)',
              borderRadius: 10,
              color: '#f0a8a8',
            }}
          >
            <LogOut size={16} />
            {t('logout') || 'Вийти'}
          </button>

          {!showDelete ? (
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 text-[12px] bg-transparent border-0"
              style={{ color: 'var(--cpc-muted)' }}
            >
              <Trash2 size={14} />
              Видалити акаунт
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              <p className="cpc-muted text-[12px]">
                Введіть delete — усі рахунки, клієнти й дані зникнуть.
              </p>
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="delete"
                className="w-full min-h-[44px] text-[15px] px-3 outline-none"
                style={fieldStyle}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDelete(false);
                    setDeleteText('');
                  }}
                  className="flex-1 min-h-[44px] text-[13px]"
                  style={{
                    background: 'var(--cpc-bg)',
                    border: '1px solid var(--cpc-line)',
                    borderRadius: 10,
                    color: 'var(--cpc-text)',
                  }}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteText.toLowerCase() !== 'delete' || deleting}
                  className="flex-1 min-h-[44px] text-[13px] font-medium disabled:opacity-40"
                  style={{
                    background: 'rgba(240,100,100,0.2)',
                    border: '1px solid rgba(240,100,100,0.35)',
                    borderRadius: 10,
                    color: '#f0a8a8',
                  }}
                >
                  {deleting ? '…' : 'Видалити'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
