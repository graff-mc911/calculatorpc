import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, MessageCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { CompanyProfileForm } from '../components/CompanyProfileForm';

/**
 * /account — company profile (same form as /settings).
 * Kept for existing links; settings gear also hosts the form.
 */
export const Account: React.FC = () => {
  const { t } = useLanguage();
  const { showSuccess } = useToastContext();
  const navigate = useNavigate();
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

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">
        {t('companyProfile') || t('account') || 'Профіль компанії'}
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

      <CompanyProfileForm />
    </div>
  );
};
