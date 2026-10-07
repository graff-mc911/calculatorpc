import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  FilePlus,
  HelpCircle,
  Printer,
  Search,
  Settings,
  Share2,
  Upload,
  User,
} from 'lucide-react';
import { usePdfStore } from '../../store/usePdfStore';

export const PDFHeader: React.FC = () => {
  const navigate = useNavigate();
  const setQuickToolsOpen = usePdfStore((s) => s.setQuickToolsOpen);
  const setCreateFileOpen = usePdfStore((s) => s.setCreateFileOpen);
  const triggerUploadDialog = usePdfStore((s) => s.triggerUploadDialog);
  const downloadActivePdf = usePdfStore((s) => s.downloadActivePdf);
  const printActive = usePdfStore((s) => s.printActive);
  const pushToast = usePdfStore((s) => s.pushToast);

  const links = [
    { label: 'Продукт', onClick: () => pushToast('info', 'CPC PDF — редактор документів') },
    { label: 'Плани', onClick: () => navigate('/paywall') },
    { label: 'Швидкі інструменти', onClick: () => setQuickToolsOpen(true) },
    { label: 'Для бізнесу', onClick: () => pushToast('info', 'Для бізнесу: командні інструменти') },
    { label: 'Підтримка', onClick: () => pushToast('info', 'Підтримка: support@calculatorpc.com') },
  ];

  return (
    <header className="h-12 flex items-center gap-2 px-3 sm:px-4 border-b border-[#e5e7eb] bg-white shrink-0 z-30">
      <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 shrink-0" title="На головну">
        <span className="text-[#e11d48] font-bold text-xl tracking-tight lowercase">cpc</span>
        <span className="text-[#64748b] text-xs font-medium hidden sm:inline">PDF</span>
      </button>

      <button
        type="button"
        onClick={() => setCreateFileOpen(true)}
        className="ml-1 sm:ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-[12px] font-semibold shadow-sm"
      >
        <FilePlus size={14} />
        <span className="hidden sm:inline">Створити файл</span>
        <span className="sm:hidden">Новий</span>
      </button>

      <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0">
        {links.map((link) => (
          <button
            key={link.label}
            type="button"
            onClick={link.onClick}
            className="px-2.5 py-1.5 text-[13px] text-[#334155] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-md whitespace-nowrap"
          >
            {link.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-0.5 ml-auto">
        <button
          type="button"
          onClick={() => setQuickToolsOpen(true)}
          className="lg:hidden px-2 py-1.5 text-xs font-medium text-[#2563eb] hover:bg-[#eff6ff] rounded-md"
        >
          Інструменти
        </button>
        <button type="button" onClick={triggerUploadDialog} className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#64748b]" title="Завантажити">
          <Upload size={16} />
        </button>
        <button type="button" onClick={() => void downloadActivePdf()} className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#64748b]" title="Завантажити PDF">
          <Download size={16} />
        </button>
        <button type="button" onClick={printActive} className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#64748b] hidden sm:inline-flex" title="Друк">
          <Printer size={16} />
        </button>
        <button type="button" onClick={() => pushToast('info', 'Пошук по документу — скоро')} className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#64748b]" title="Пошук">
          <Search size={16} />
        </button>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(window.location.href); pushToast('success', 'Посилання скопійовано'); }} className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#64748b] hidden md:inline-flex" title="Поділитися">
          <Share2 size={16} />
        </button>
        <button type="button" onClick={() => pushToast('info', 'Довідка PDF-редактора')} className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#64748b] hidden md:inline-flex" title="Допомога">
          <HelpCircle size={16} />
        </button>
        <button type="button" onClick={() => navigate('/settings')} className="p-2 rounded-full hover:bg-[#f1f5f9] text-[#64748b] hidden md:inline-flex" title="Налаштування">
          <Settings size={16} />
        </button>
        <button type="button" onClick={() => navigate('/account')} className="ml-1 w-8 h-8 rounded-full bg-[#3b82f6] text-white flex items-center justify-center" title="Акаунт">
          <User size={16} />
        </button>
      </div>
    </header>
  );
};
