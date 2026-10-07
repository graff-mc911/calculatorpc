import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Receipt, Users, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/Button';

interface OnboardingSlide {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides: OnboardingSlide[] = [
    {
      icon: <FileText size={80} className="text-orange-500" />,
      title: t('onboardingTitle1'),
      description: t('onboardingDesc1'),
    },
    {
      icon: <Receipt size={80} className="text-orange-500" />,
      title: t('onboardingTitle2'),
      description: t('onboardingDesc2'),
    },
    {
      icon: <Users size={80} className="text-orange-500" />,
      title: t('onboardingTitle3'),
      description: t('onboardingDesc3'),
    },
    {
      icon: <Wifi size={80} className="text-orange-500" />,
      title: t('onboardingTitle4'),
      description: t('onboardingDesc4'),
    },
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const completeOnboarding = () => {
    localStorage.setItem('onboardingCompleted', 'true');
    navigate('/signup');
  };

  return (
    <div className="min-h-screen bg-[#1a1f24] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="mb-8 flex justify-center">
                <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-lg">
                  {slides[currentSlide].icon}
                </div>
              </div>

              <h2 className="text-3xl font-bold text-white mb-4">
                {slides[currentSlide].title}
              </h2>

              <p className="text-lg text-white/70 leading-relaxed px-4">
                {slides[currentSlide].description}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-center gap-2 mt-12 mb-8">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? 'w-8 bg-orange-500'
                    : 'w-2 bg-white/20'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-4">
            {currentSlide < slides.length - 1 ? (
              <>
                <Button
                  onClick={handleSkip}
                  className="flex-1"
                >
                  {t('skip')}
                </Button>
                <Button
                  active
                  onClick={handleNext}
                  className="flex-1"
                >
                  {t('next')}
                </Button>
              </>
            ) : (
              <Button
                active
                onClick={handleNext}
                className="w-full"
              >
                {t('getStarted')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="text-center pb-6">
        <p className="text-sm text-white/40">
          <span className="sm:hidden">CPC</span>
          <span className="hidden sm:inline">{t('appName')}</span>
          {' — '}
          {t('appSubtitle')}
        </p>
      </div>
    </div>
  );
};
