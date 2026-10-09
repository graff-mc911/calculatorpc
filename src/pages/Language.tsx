import React from 'react';
import { Check } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useLanguage } from '../contexts/LanguageContext';
import { languages } from '../lib/languages';

export const Language: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 pt-2 pb-8">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900">{t('language')}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="space-y-2">
          {languages.map((lang) => (
            <Card
              key={lang.code}
              className={`p-4 cursor-pointer transition-all ${
                language === lang.code
                  ? 'bg-primary-50 border-primary-200'
                  : 'hover:bg-slate-50'
              }`}
              onClick={() => setLanguage(lang.code)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="font-medium text-slate-900">{lang.name}</span>
                </div>
                {language === lang.code && (
                  <Check className="h-5 w-5 text-primary-600" />
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
