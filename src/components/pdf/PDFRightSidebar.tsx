import React from 'react';
import {
  AtSign,
  Calendar,
  CheckSquare,
  ChevronRight,
  Image as ImageIcon,
  PenLine,
  Type,
  User,
  X,
} from 'lucide-react';
import { type OverlayFieldType, usePdfStore } from '../../store/usePdfStore';

const SIGN_FIELDS: { type: OverlayFieldType; label: string; icon: typeof PenLine; tone: string }[] = [
  { type: 'signature', label: 'Signature', icon: PenLine, tone: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]' },
  { type: 'initials', label: 'Initials', icon: Type, tone: 'bg-[#f0fdfa] text-[#0f766e] border-[#99f6e4]' },
  { type: 'date', label: 'Date', icon: Calendar, tone: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]' },
  { type: 'name', label: 'Name', icon: User, tone: 'bg-[#eff6ff] text-[#1e40af] border-[#bfdbfe]' },
  { type: 'email', label: 'Email', icon: AtSign, tone: 'bg-[#eef2ff] text-[#4338ca] border-[#c7d2fe]' },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, tone: 'bg-[#f8fafc] text-[#334155] border-[#cbd5e1]' },
  { type: 'text', label: 'Text', icon: Type, tone: 'bg-[#f8fafc] text-[#0f172a] border-[#cbd5e1]' },
  { type: 'image', label: 'Image', icon: ImageIcon, tone: 'bg-[#faf5ff] text-[#6b21a8] border-[#e9d5ff]' },
];

export const PDFRightSidebar: React.FC = () => {
  const sidebarOpen = usePdfStore((s) => s.sidebarOpen);
  const ribbonTab = usePdfStore((s) => s.ribbonTab);
  const placingType = usePdfStore((s) => s.placingType);
  const setPlacingType = usePdfStore((s) => s.setPlacingType);
  const toggleSidebar = usePdfStore((s) => s.toggleSidebar);
  const setSidebarOpen = usePdfStore((s) => s.setSidebarOpen);
  const selectedFieldId = usePdfStore((s) => s.selectedFieldId);
  const removeField = usePdfStore((s) => s.removeField);
  const setSignatureModalOpen = usePdfStore((s) => s.setSignatureModalOpen);
  const setQuickToolsOpen = usePdfStore((s) => s.setQuickToolsOpen);
  const triggerUploadDialog = usePdfStore((s) => s.triggerUploadDialog);
  const pushToast = usePdfStore((s) => s.pushToast);
  const documents = usePdfStore((s) => s.documents);
  const activeDocId = usePdfStore((s) => s.activeDocId);
  const doc = documents.find((d) => d.id === activeDocId);

  if (!sidebarOpen) {
    return (
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-[#e5e7eb] border-r-0 rounded-l-lg px-1.5 py-3 shadow text-[#64748b] hover:text-[#3b82f6] min-h-[44px] min-w-[36px]"
        title="Open panel"
      >
        <ChevronRight size={16} className="rotate-180" />
      </button>
    );
  }

  const title =
    ribbonTab === 'ocr'
      ? 'OCR'
      : ribbonTab === 'edit'
        ? 'Edit tools'
        : ribbonTab === 'secure'
          ? 'Secure'
          : ribbonTab === 'forms'
            ? 'Forms'
            : ribbonTab === 'comment'
              ? 'Comment'
              : 'Sign your document';

  const pick = (type: OverlayFieldType) => {
    if (type === 'signature') {
      setSignatureModalOpen(true);
      return;
    }
    if (type === 'image') {
      setPlacingType('image');
      triggerUploadDialog();
      pushToast('info', 'Оберіть зображення, потім клікніть на сторінку');
      return;
    }
    setPlacingType(placingType === type ? null : type);
    pushToast('info', `Клікніть на сторінку: ${type}`);
  };

  return (
    <>
      {/* Mobile: dim backdrop so sidebar is an overlay, not a permanent desktop column */}
      <button
        type="button"
        className="lg:hidden fixed inset-0 z-30 bg-black/35 border-0 p-0"
        aria-label="Close panel"
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className="fixed lg:static inset-y-0 right-0 z-40 w-[min(260px,88vw)] lg:w-[260px] shrink-0 bg-white border-l border-[#e5e7eb] flex flex-col shadow-xl lg:shadow-none"
      >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef2f7]">
        <h3 className="text-[14px] font-semibold text-[#0f172a]">{title}</h3>
        <button type="button" onClick={toggleSidebar} className="p-2 min-h-[44px] min-w-[44px] rounded hover:bg-[#f1f5f9] text-[#94a3b8]" aria-label="Collapse">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <p className="text-[11px] text-[#94a3b8] uppercase tracking-wide px-1 mb-2">Поля на документ</p>
        {SIGN_FIELDS.map(({ type, label, icon: Icon, tone }) => (
          <button
            key={type}
            type="button"
            onClick={() => pick(type)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-[13px] font-medium transition-all ${tone} ${
              placingType === type ? 'ring-2 ring-[#3b82f6] ring-offset-1' : 'hover:brightness-[0.98]'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setSignatureModalOpen(true)}
          className="w-full mt-2 py-2 rounded-lg bg-[#dbeafe] text-[#1d4ed8] text-[13px] font-medium"
        >
          My signature…
        </button>

        {placingType && (
          <p className="text-[12px] text-[#2563eb] px-1 pt-2">Клікніть на сторінку → «{placingType}»</p>
        )}
        {selectedFieldId && (
          <button
            type="button"
            onClick={() => removeField(selectedFieldId)}
            className="w-full mt-2 text-[12px] text-red-600 hover:bg-red-50 rounded-lg py-2 border border-red-100"
          >
            Видалити вибране поле
          </button>
        )}
        {doc && <p className="text-[11px] text-[#94a3b8] px-1 pt-2">Полів: {doc.fields.length}</p>}

        {ribbonTab === 'ocr' && (
          <button
            type="button"
            onClick={() => setQuickToolsOpen(true)}
            className="w-full py-2 rounded-lg bg-[#eff6ff] text-[#1d4ed8] text-[13px] font-medium mt-2"
          >
            Відкрити OCR у Quick Tools
          </button>
        )}
      </div>
    </aside>
    </>
  );
};
