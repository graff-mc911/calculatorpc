import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export const TermsOfService: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-[#1a1f24] pt-16 pb-8">
      <div className="max-w-4xl mx-auto px-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-3 py-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl mb-6 transition-all active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
          {t('back')}
        </button>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">{t('termsOfService')}</h1>
          <p className="text-sm text-slate-500 mb-8">{t('lastUpdated')}: March 27, 2026</p>

          <div className="prose prose-slate max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('termsAcceptance')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('termsAcceptanceText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('serviceDescription')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('serviceDescriptionText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('userAccount')}</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>{t('userAccountResponsibility')}</li>
                <li>{t('userAccountSecurity')}</li>
                <li>{t('userAccountAccuracy')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('acceptableUse')}</h2>
              <p className="text-slate-700 leading-relaxed mb-3">{t('acceptableUseIntro')}</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>{t('acceptableUseIllegal')}</li>
                <li>{t('acceptableUseHarm')}</li>
                <li>{t('acceptableUseAbuse')}</li>
                <li>{t('acceptableUseReverse')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('intellectualProperty')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('intellectualPropertyText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('disclaimer')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('disclaimerText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('limitation')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('limitationText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('termination')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('terminationText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('changesTerms')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('changesTermsText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('contact')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('contactTermsText')}
              </p>
              <p className="text-slate-700 mt-3">
                Email: <a href="mailto:support@calculatorpc.com" className="text-primary-600 hover:text-primary-700">support@calculatorpc.com</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
