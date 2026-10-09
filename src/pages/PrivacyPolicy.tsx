import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export const PrivacyPolicy: React.FC = () => {
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
          {t('back')} — CPC
        </button>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">{t('privacyPolicy')}</h1>
          <p className="text-sm text-slate-500 mb-8">{t('lastUpdated')}: March 27, 2026</p>

          <div className="prose prose-slate max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('privacyIntro')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('privacyIntroText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('dataCollection')}</h2>
              <p className="text-slate-700 leading-relaxed mb-3">{t('dataCollectionText')}</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>{t('dataCollectionEmail')}</li>
                <li>{t('dataCollectionCompany')}</li>
                <li>{t('dataCollectionInvoices')}</li>
                <li>{t('dataCollectionDocuments')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('dataUsage')}</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>{t('dataUsageService')}</li>
                <li>{t('dataUsageSupport')}</li>
                <li>{t('dataUsageImprove')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('dataStorage')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('dataStorageText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('dataSecurity')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('dataSecurityText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('userRights')}</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li>{t('userRightsAccess')}</li>
                <li>{t('userRightsCorrect')}</li>
                <li>{t('userRightsDelete')}</li>
                <li>{t('userRightsExport')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('permissions')}</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-700">
                <li><strong>{t('cameraPermission')}</strong>: {t('cameraPermissionText')}</li>
                <li><strong>{t('storagePermission')}</strong>: {t('storagePermissionText')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('thirdParty')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('thirdPartyText')}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t('contact')}</h2>
              <p className="text-slate-700 leading-relaxed">
                {t('contactText')}
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
