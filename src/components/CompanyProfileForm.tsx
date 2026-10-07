import React, { useEffect, useRef, useState } from 'react';
import { Building2, Landmark, ImageIcon, Save, Upload, X, RotateCcw } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type FormData = {
  company_name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  bank_name: string;
  iban: string;
  bic: string;
  tax_number: string;
  signature_url: string;
  google_client_ids: string;
};

const EMPTY_FORM: FormData = {
  company_name: '',
  logo_url: '',
  address: '',
  phone: '',
  email: '',
  bank_name: '',
  iban: '',
  bic: '',
  tax_number: '',
  signature_url: '',
  google_client_ids: '',
};

function profileToForm(profile: Record<string, any> | null | undefined): FormData {
  if (!profile) return { ...EMPTY_FORM };
  return {
    company_name: profile.company_name || '',
    logo_url: profile.logo_url || '',
    address: profile.address || '',
    phone: profile.phone || '',
    email: profile.email || '',
    bank_name: profile.bank_name || '',
    iban: profile.iban || '',
    bic: profile.bic || '',
    tax_number: profile.tax_number || '',
    signature_url: profile.signature_url || '',
    google_client_ids: profile.google_client_ids || '',
  };
}

async function uploadToCompanyLogos(
  userId: string,
  file: File,
  kind: 'logo' | 'signature',
  previousPath?: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const safeExt = ext === 'jpeg' ? 'jpg' : ext;
  const storagePath = `${userId}/${kind}-${Date.now()}.${safeExt}`;

  if (previousPath) {
    const { error: removeOldError } = await supabase.storage
      .from('company-logos')
      .remove([previousPath]);
    if (removeOldError) {
      console.warn('Could not remove previous file:', removeOldError.message);
    }
  }

  const { error: uploadError } = await supabase.storage
    .from('company-logos')
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from('company-logos').getPublicUrl(storagePath);

  return { publicUrl, storagePath };
}

export const CompanyProfileForm: React.FC = () => {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM });
  const [baseline, setBaseline] = useState<FormData>({ ...EMPTY_FORM });
  const [logoPreview, setLogoPreview] = useState('');
  const [signaturePreview, setSignaturePreview] = useState('');
  const [logoStoragePath, setLogoStoragePath] = useState('');
  const [signatureStoragePath, setSignatureStoragePath] = useState('');
  const [baselineLogoPath, setBaselineLogoPath] = useState('');
  const [baselineSignaturePath, setBaselineSignaturePath] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [googleClientIdsError, setGoogleClientIdsError] = useState('');

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
  });

  const { data: profile, isLoading } = useQuery({
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

  useEffect(() => {
    const next = profileToForm(profile);
    setFormData(next);
    setBaseline(next);
    setLogoPreview(profile?.logo_url || '');
    setSignaturePreview(profile?.signature_url || '');
    setLogoStoragePath(profile?.logo_path || '');
    setSignatureStoragePath(profile?.signature_path || '');
    setBaselineLogoPath(profile?.logo_path || '');
    setBaselineSignaturePath(profile?.signature_path || '');
  }, [profile]);

  const validateGoogleClientIds = (value: string): boolean => {
    if (!value.trim()) {
      setGoogleClientIdsError('');
      return true;
    }

    const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
    const validPatterns = [
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z0-9._-]+$/,
      /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/,
    ];
    const allValid = ids.every((id) => validPatterns.some((pattern) => pattern.test(id)));

    if (!allValid) {
      setGoogleClientIdsError(t('invalidGoogleClientIdsFormat') || 'Invalid Google Client ID format');
      return false;
    }

    setGoogleClientIdsError('');
    return true;
  };

  const handleGoogleClientIdsChange = (value: string) => {
    const trimmedValue = value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .join(', ');
    setFormData((prev) => ({ ...prev, google_client_ids: trimmedValue }));
    validateGoogleClientIds(value);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    if (!file.type.startsWith('image/')) {
      showError(t('uploadImageOnly') || 'Images only');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError(t('fileSizeLimit') || 'Max 2 MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const { publicUrl, storagePath } = await uploadToCompanyLogos(
        session.user.id,
        file,
        'logo',
        logoStoragePath || undefined,
      );
      const previewUrl = `${publicUrl}?v=${Date.now()}`;
      setLogoStoragePath(storagePath);
      setLogoPreview(previewUrl);
      setFormData((prev) => ({ ...prev, logo_url: publicUrl }));
      showSuccess(t('logoUploaded') || 'Logo uploaded');
    } catch (error: any) {
      console.error('Upload logo error:', error);
      showError(error?.message || t('failedUploadLogo') || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    if (file.type !== 'image/png') {
      showError(t('signaturePngOnly') || 'Signature/stamp must be a transparent PNG');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError(t('fileSizeLimit') || 'Max 2 MB');
      return;
    }

    setUploadingSignature(true);
    try {
      const { publicUrl, storagePath } = await uploadToCompanyLogos(
        session.user.id,
        file,
        'signature',
        signatureStoragePath || undefined,
      );
      const previewUrl = `${publicUrl}?v=${Date.now()}`;
      setSignatureStoragePath(storagePath);
      setSignaturePreview(previewUrl);
      setFormData((prev) => ({ ...prev, signature_url: publicUrl }));
      showSuccess(t('signatureUploaded') || 'Signature/stamp uploaded');
    } catch (error: any) {
      console.error('Upload signature error:', error);
      showError(error?.message || t('failedUploadSignature') || 'Failed to upload signature');
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!session?.user?.id) return;
    try {
      if (logoStoragePath) {
        const { error } = await supabase.storage.from('company-logos').remove([logoStoragePath]);
        if (error) throw error;
      }
      setFormData((prev) => ({ ...prev, logo_url: '' }));
      setLogoPreview('');
      setLogoStoragePath('');
      showSuccess(t('logoRemoved') || 'Logo removed');
    } catch (error: any) {
      console.error('Remove logo error:', error);
      showError(error?.message || 'Failed to remove logo');
    }
  };

  const handleRemoveSignature = async () => {
    if (!session?.user?.id) return;
    try {
      if (signatureStoragePath) {
        const { error } = await supabase.storage.from('company-logos').remove([signatureStoragePath]);
        if (error) throw error;
      }
      setFormData((prev) => ({ ...prev, signature_url: '' }));
      setSignaturePreview('');
      setSignatureStoragePath('');
      showSuccess(t('signatureRemoved') || 'Signature/stamp removed');
    } catch (error: any) {
      console.error('Remove signature error:', error);
      showError(error?.message || 'Failed to remove signature');
    }
  };

  const handleReset = () => {
    setFormData({ ...baseline });
    setLogoPreview(baseline.logo_url || '');
    setSignaturePreview(baseline.signature_url || '');
    setLogoStoragePath(baselineLogoPath);
    setSignatureStoragePath(baselineSignaturePath);
    setGoogleClientIdsError('');
    showSuccess(t('settingsReset') || 'Restored previous values');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error('Not authenticated');
      if (!validateGoogleClientIds(formData.google_client_ids)) {
        throw new Error(t('invalidGoogleClientIdsFormat') || 'Invalid Google Client IDs');
      }

      const payload = {
        ...formData,
        logo_path: logoStoragePath,
        signature_path: signatureStoragePath,
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
        const { error } = await supabase.from('company_profile').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setBaseline({ ...formData });
      setBaselineLogoPath(logoStoragePath);
      setBaselineSignaturePath(signatureStoragePath);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showSuccess(t('profileSaved') || 'Saved');
    },
    onError: (error: Error) => {
      showError(error.message || t('errorSavingProfile') || 'Save failed');
    },
  });

  const field = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((prev) => ({ ...prev, [key]: e.target.value }));

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-white/50 text-sm">{t('loading') || 'Loading…'}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1) Company info */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center">
            <Building2 className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <h2 className="font-medium text-white">
              {t('companyInfo') || 'Company info'}
            </h2>
            <p className="text-sm text-white/60">
              {t('updateCompanyInfo') || 'Name, tax ID, address, contacts'}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <Input
            label={t('companyName') || 'Company / entrepreneur name'}
            value={formData.company_name}
            onChange={field('company_name')}
          />
          <Input
            label={t('taxNumberEdrpou') || 'ЄДРПОУ / NIF'}
            value={formData.tax_number}
            onChange={field('tax_number')}
          />
          <Input
            label={t('address') || 'Address'}
            value={formData.address}
            onChange={field('address')}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={t('phone') || 'Phone'}
              value={formData.phone}
              onChange={field('phone')}
            />
            <Input
              label={t('email') || 'Email'}
              type="email"
              value={formData.email}
              onChange={field('email')}
            />
          </div>
        </div>
      </Card>

      {/* 2) Bank */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-teal-500/20 rounded-full flex items-center justify-center">
            <Landmark className="h-6 w-6 text-teal-400" />
          </div>
          <div>
            <h2 className="font-medium text-white">{t('bankDetails') || 'Bank'}</h2>
            <p className="text-sm text-white/60">
              {t('bankDetailsHelp') || 'Shown on invoice PDF footer'}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <Input
            label={t('iban') || 'IBAN'}
            value={formData.iban}
            onChange={field('iban')}
          />
          <Input
            label={t('bankName') || 'Bank name'}
            value={formData.bank_name}
            onChange={field('bank_name')}
          />
          <Input
            label={t('swiftLabel') || 'SWIFT / BIC'}
            value={formData.bic}
            onChange={field('bic')}
          />
        </div>
      </Card>

      {/* 3) Files */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-sky-500/20 rounded-full flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-sky-400" />
          </div>
          <div>
            <h2 className="font-medium text-white">{t('companyFiles') || 'Files'}</h2>
            <p className="text-sm text-white/60">
              {t('companyFilesHelp') || 'Logo for PDF header; signature/stamp PNG'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              {t('companyLogo') || 'Logo'}
            </label>
            {logoPreview ? (
              <div className="relative inline-block">
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="w-32 h-32 object-contain border border-white/10 rounded-lg bg-white/5 p-2"
                />
                <button
                  onClick={handleRemoveLogo}
                  className="absolute -top-2 -right-2 bg-red-500/90 border border-red-600/50 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  type="button"
                  aria-label="Remove logo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                type="button"
                className="flex items-center gap-2 px-4 py-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/20 transition-all active:scale-95 disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                <span className="text-sm">
                  {uploadingLogo
                    ? t('uploading') || 'Uploading…'
                    : logoPreview
                      ? t('replaceLogo') || 'Replace logo'
                      : t('uploadLogo') || 'Upload logo'}
                </span>
              </button>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <p className="text-xs text-white/50 mt-2">
              {t('pngJpgUpTo2mb') || 'PNG, JPG, WebP up to 2 MB'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              {t('signatureStamp') || 'Signature / Stamp'}
            </label>
            {signaturePreview ? (
              <div className="relative inline-block">
                <img
                  src={signaturePreview}
                  alt="Signature"
                  className="w-40 h-24 object-contain border border-white/10 rounded-lg bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2"
                />
                <button
                  onClick={handleRemoveSignature}
                  className="absolute -top-2 -right-2 bg-red-500/90 border border-red-600/50 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  type="button"
                  aria-label="Remove signature"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <div className="mt-2">
              <button
                onClick={() => signatureInputRef.current?.click()}
                disabled={uploadingSignature}
                type="button"
                className="flex items-center gap-2 px-4 py-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl text-gray-300 hover:text-white hover:bg-white/20 transition-all active:scale-95 disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                <span className="text-sm">
                  {uploadingSignature
                    ? t('uploading') || 'Uploading…'
                    : signaturePreview
                      ? t('replaceSignature') || 'Replace signature/stamp'
                      : t('uploadSignatureStamp') || 'Upload signature/stamp PNG'}
                </span>
              </button>
            </div>
            <input
              ref={signatureInputRef}
              type="file"
              accept="image/png"
              onChange={handleSignatureUpload}
              className="hidden"
            />
            <p className="text-xs text-white/50 mt-2">
              {t('signaturePngHelp') || 'Transparent PNG, up to 2 MB — used on invoices/PDFs'}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10">
          <label className="block text-sm font-medium text-white/70 mb-2">
            {t('googleClientIds') || 'Google Client ID'}
          </label>
          <Input
            placeholder={t('googleClientIdsPlaceholder') || 'Comma-separated IDs'}
            value={formData.google_client_ids}
            onChange={(e) => handleGoogleClientIdsChange(e.target.value)}
          />
          {googleClientIdsError && (
            <p className="text-xs text-red-500 mt-1">{googleClientIdsError}</p>
          )}
          <p className="text-xs text-white/50 mt-1">
            {t('googleClientIdsHelp') || 'Optional Google OAuth client IDs'}
          </p>
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !!googleClientIdsError}
          className="flex-1"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending
            ? t('saving') || 'Saving…'
            : t('saveChanges') || 'Save changes'}
        </Button>
        <button
          type="button"
          onClick={handleReset}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-white/10 border border-white/10 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-all active:scale-95"
        >
          <RotateCcw className="h-4 w-4" />
          {t('reset') || 'Reset'}
        </button>
      </div>
    </div>
  );
};
