import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Save, Upload, X, CheckCircle, MessageCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

export const Account: React.FC = () => {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingSuccess, setBillingSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('billing') === 'success') {
      setBillingSuccess(true);
      showSuccess('Ваш 30-денний пробний період розпочато!');
      const p = new URLSearchParams(searchParams);
      p.delete('billing');
      setSearchParams(p, { replace: true });
    }
  }, [searchParams, setSearchParams, showSuccess]);

  const [formData, setFormData] = useState({
    company_name: '',
    logo_url: '',
    address: '',
    phone: '',
    email: '',
    bank_name: '',
    iban: '',
    bic: '',
    tax_number: '',
    google_client_ids: '',
  });

  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [logoStoragePath, setLogoStoragePath] = useState<string>('');
  const [googleClientIdsError, setGoogleClientIdsError] = useState<string>('');

  // --------------------------------------------------
  // Поточна сесія
  // --------------------------------------------------
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
  });

  // --------------------------------------------------
  // Профіль компанії
  // --------------------------------------------------
  const { data: profile } = useQuery({
    queryKey: ['profile', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_profile')
        .select('*')
        .eq('user_id', session?.user?.id || '')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  // --------------------------------------------------
  // Підставляємо дані профілю в форму
  // --------------------------------------------------
  useEffect(() => {
    if (!profile) return;

    setFormData({
      company_name: profile.company_name || '',
      logo_url: profile.logo_url || '',
      address: profile.address || '',
      phone: profile.phone || '',
      email: profile.email || '',
      bank_name: profile.bank_name || '',
      iban: profile.iban || '',
      bic: profile.bic || '',
      tax_number: profile.tax_number || '',
      google_client_ids: profile.google_client_ids || '',
    });

    setLogoPreview(profile.logo_url || '');
    setLogoStoragePath(profile.logo_path || '');
  }, [profile]);

  // --------------------------------------------------
  // Перевірка Google Client IDs
  // --------------------------------------------------
  const validateGoogleClientIds = (value: string): boolean => {
    if (!value.trim()) {
      setGoogleClientIdsError('');
      return true;
    }

    const ids = value.split(',').map(id => id.trim()).filter(Boolean);

    const validPatterns = [
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z0-9._-]+$/,
      /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/,
    ];

    const allValid = ids.every(id =>
      validPatterns.some(pattern => pattern.test(id))
    );

    if (!allValid) {
      setGoogleClientIdsError(t('invalidGoogleClientIdsFormat'));
      return false;
    }

    setGoogleClientIdsError('');
    return true;
  };

  const handleGoogleClientIdsChange = (value: string) => {
    const trimmedValue = value
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .join(', ');

    setFormData(prev => ({ ...prev, google_client_ids: trimmedValue }));
    validateGoogleClientIds(value);
  };

  // --------------------------------------------------
  // Завантаження логотипа
  // --------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    if (!file.type.startsWith('image/')) {
      showError(t('uploadImageOnly') || 'Дозволені лише зображення');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showError(t('fileSizeLimit') || 'Файл завеликий. Максимум 2 МБ');
      return;
    }

    setUploading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const safeExt = ext === 'jpeg' ? 'jpg' : ext;
      const storagePath = `${session.user.id}/logo-${Date.now()}.${safeExt}`;

      // якщо був старий логотип — видаляємо його
      if (logoStoragePath) {
        const { error: removeOldError } = await supabase.storage
          .from('company-logos')
          .remove([logoStoragePath]);

        if (removeOldError) {
          console.warn('Не вдалося видалити старий логотип:', removeOldError.message);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('company-logos').getPublicUrl(storagePath);

      // cache buster, щоб браузер не показував старий логотип
      const previewUrl = `${publicUrl}?v=${Date.now()}`;

      setLogoStoragePath(storagePath);
      setLogoPreview(previewUrl);
      setFormData(prev => ({
        ...prev,
        logo_url: publicUrl,
      }));

      showSuccess(t('logoUploaded') || 'Логотип успішно завантажено');
    } catch (error: any) {
      console.error('Upload logo error:', error);

      // показуємо реальну причину
      showError(
        error?.message ||
          t('failedUploadLogo') ||
          'Не вдалося завантажити логотип'
      );
    } finally {
      setUploading(false);

      // щоб можна було завантажити той самий файл ще раз
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // --------------------------------------------------
  // Видалення логотипа
  // --------------------------------------------------
  const handleRemoveLogo = async () => {
    if (!session?.user?.id) return;

    try {
      if (logoStoragePath) {
        const { error } = await supabase.storage
          .from('company-logos')
          .remove([logoStoragePath]);

        if (error) throw error;
      }

      setFormData(prev => ({ ...prev, logo_url: '' }));
      setLogoPreview('');
      setLogoStoragePath('');

      showSuccess(t('logoRemoved') || 'Логотип видалено');
    } catch (error: any) {
      console.error('Remove logo error:', error);
      showError(error?.message || 'Не вдалося видалити логотип');
    }
  };

  // --------------------------------------------------
  // Збереження профілю
  // --------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) {
        throw new Error('Користувач не авторизований');
      }

      if (!validateGoogleClientIds(formData.google_client_ids)) {
        throw new Error(t('invalidGoogleClientIdsFormat'));
      }

      const payload = {
        ...formData,
        logo_path: logoStoragePath,
        user_id: session.user.id,
        updated_at: new Date().toISOString(),
      };

      if (profile) {
        const { error } = await supabase
          .from('company_profile')
          .update(payload)
          .eq('user_id', session.user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_profile')
          .insert([payload]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showSuccess(t('profileSaved') || 'Профіль збережено');
    },
    onError: (error: Error) => {
      if (error.message.includes('Google Client IDs')) {
        showError(googleClientIdsError || t('invalidGoogleClientIdsFormat'));
      } else {
        showError(error.message || t('errorSavingProfile') || 'Помилка збереження профілю');
      }
    },
  });

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">
        {t('account') || 'Акаунт'}
      </h1>

      {billingSuccess && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <CheckCircle size={18} className="shrink-0" />
          <span>Ваш 30-денний пробний період розпочато. Всі функції розблоковано.</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/contact')}
        className="mb-4 flex items-center justify-between w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 transition-colors text-left"
      >
        <span className="flex items-center gap-2 text-white text-sm">
          <MessageCircle className="h-4 w-4 text-orange-400" />
          {t('contactUs') || 'Зв’язатися з нами'}
        </span>
        <span className="text-white/40">›</span>
      </button>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center">
              <Building2 className="h-6 w-6 text-orange-400" />
            </div>
            <div>
              <h2 className="font-medium text-white">
                {t('companyProfile') || 'Профіль компанії'}
              </h2>
              <p className="text-sm text-white/60">
                {t('updateCompanyInfo') || 'Оновіть інформацію про компанію'}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <Input
              label={t('companyName') || 'Назва компанії'}
              value={formData.company_name}
              onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
            />

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                {t('companyLogo') || 'Логотип компанії'}
              </label>

              {logoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={logoPreview}
                    alt="Company Logo"
                    className="w-32 h-32 object-contain border border-white/10 rounded-lg bg-white/5 p-2"
                  />
                  <button
                    onClick={handleRemoveLogo}
                    className="absolute -top-2 -right-2 bg-red-500/90 border border-red-600/50 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  type="button"
                  className="flex items-center gap-2 px-4 py-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-sm">
                    {uploading
                      ? (t('uploading') || 'Завантаження...')
                      : (t('uploadLogo') || 'Завантажити логотип')}
                  </span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />

              <p className="text-xs text-white/50 mt-2">
                {t('pngJpgUpTo2mb') || 'PNG, JPG до 2МБ'}
              </p>
            </div>

            <Input
              label={t('address') || 'Адреса'}
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('phone') || 'Телефон'}
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                label={t('email') || 'Email'}
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <Input
              label={t('bankName') || 'Назва банку'}
              value={formData.bank_name}
              onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('iban') || 'IBAN'}
                value={formData.iban}
                onChange={(e) => setFormData(prev => ({ ...prev, iban: e.target.value }))}
              />
              <Input
                label={t('bic') || 'BIC'}
                value={formData.bic}
                onChange={(e) => setFormData(prev => ({ ...prev, bic: e.target.value }))}
              />
            </div>

            <Input
              label={t('taxNumber') || 'Податковий номер'}
              value={formData.tax_number}
              onChange={(e) => setFormData(prev => ({ ...prev, tax_number: e.target.value }))}
            />

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                {t('googleClientIds') || 'Google Client ID'}
              </label>
              <Input
                placeholder={t('googleClientIdsPlaceholder') || 'Введіть ID через кому'}
                value={formData.google_client_ids}
                onChange={(e) => handleGoogleClientIdsChange(e.target.value)}
              />
              {googleClientIdsError && (
                <p className="text-xs text-red-500 mt-1">{googleClientIdsError}</p>
              )}
              <p className="text-xs text-white/50 mt-1">
                {t('googleClientIdsHelp') || 'Введіть ID клієнтів Google OAuth або ідентифікатори застосунків через кому'}
              </p>
            </div>
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !!googleClientIdsError}
            className="w-full mt-6"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending
              ? (t('saving') || 'Збереження...')
              : (t('save') || 'Зберегти')}
          </Button>
        </Card>
      </div>
    </div>
  );
};