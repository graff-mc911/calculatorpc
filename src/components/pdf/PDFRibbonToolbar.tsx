import React from 'react';
import { ChevronDown, Home, Menu, Minus, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { type RibbonTab, usePdfStore } from '../../store/usePdfStore';

const TABS: { id: RibbonTab; label: string; dot?: boolean }[] = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create & Convert' },
  { id: 'fill', label: 'Fill & Sign' },
  { id: 'edit', label: 'Edit' },
  { id: 'page', label: 'Page' },
  { id: 'comment', label: 'Comment' },
  { id: 'secure', label: 'Secure' },
  { id: 'forms', label: 'Forms' },
  { id: 'esign', label: 'E-Sign', dot: true },
  { id: 'ocr', label: 'OCR' },
  { id: 'translate', label: 'Translate' },
  { id: 'ai', label: 'AI Assistant' },
];

const SUB: Record<RibbonTab, { id: string; label: string }[]> = {
  view: [
    { id: 'fit-width', label: 'Fit width' },
    { id: 'fit-page', label: 'Fit page' },
    { id: 'single', label: 'Single page' },
    { id: 'continuous', label: 'Continuous' },
  ],
  create: [
    { id: 'new-file', label: 'New File' },
    { id: 'upload', label: 'Upload' },
    { id: 'download', label: 'Download PDF' },
    { id: 'print', label: 'Print' },
    { id: 'merge', label: 'Merge' },
    { id: 'split', label: 'Split' },
    { id: 'compress', label: 'Compress' },
  ],
  fill: [
    { id: 'sign-doc', label: 'Sign your document' },
    { id: 'request', label: 'Request signature' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'my-sig', label: 'My signature' },
  ],
  edit: [
    { id: 'text', label: 'Text Tool' },
    { id: 'image', label: 'Image Tool' },
    { id: 'link', label: 'Link' },
    { id: 'redact', label: 'Redact' },
  ],
  page: [
    { id: 'add-page', label: '+ Page' },
    { id: 'delete-page', label: 'Delete Page' },
    { id: 'rotate-cw', label: 'Rotate ↻' },
    { id: 'rotate-ccw', label: 'Rotate ↺' },
    { id: 'extract', label: 'Extract' },
    { id: 'organize', label: 'Organize' },
  ],
  comment: [
    { id: 'note', label: 'Note' },
    { id: 'highlight', label: 'Highlight' },
    { id: 'stamp', label: 'Stamp' },
  ],
  secure: [
    { id: 'protect', label: 'Protect' },
    { id: 'unlock', label: 'Unlock' },
    { id: 'watermark', label: 'Watermark' },
  ],
  forms: [
    { id: 'text-field', label: 'Text field' },
    { id: 'checkbox', label: 'Checkbox' },
    { id: 'dropdown', label: 'Dropdown' },
  ],
  esign: [
    { id: 'sign-doc', label: 'Sign your document' },
    { id: 'request', label: 'Request signature' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'my-sig', label: 'My signature' },
    { id: 'manage', label: 'Manage signers' },
  ],
  ocr: [
    { id: 'recognize', label: 'Recognize text' },
    { id: 'searchable', label: 'Make searchable' },
  ],
  translate: [
    { id: 'lang', label: 'Translate page' },
    { id: 'doc', label: 'Translate document' },
  ],
  ai: [
    { id: 'ask', label: 'Ask AI' },
    { id: 'summarize', label: 'Summarize' },
  ],
};

export const PDFRibbonToolbar: React.FC = () => {
  const navigate = useNavigate();
  const ribbonTab = usePdfStore((s) => s.ribbonTab);
  const subAction = usePdfStore((s) => s.subAction);
  const zoom = usePdfStore((s) => s.zoom);
  const setRibbonTab = usePdfStore((s) => s.setRibbonTab);
  const handleSubAction = usePdfStore((s) => s.handleSubAction);
  const zoomIn = usePdfStore((s) => s.zoomIn);
  const zoomOut = usePdfStore((s) => s.zoomOut);
  const setZoom = usePdfStore((s) => s.setZoom);
  const setQuickToolsOpen = usePdfStore((s) => s.setQuickToolsOpen);
  const setCreateFileOpen = usePdfStore((s) => s.setCreateFileOpen);
  const pushToast = usePdfStore((s) => s.pushToast);

  const subs = SUB[ribbonTab] || [];

  return (
    <div className="bg-white border-b border-[#e5e7eb] shrink-0 z-20 w-full max-w-[100vw] min-w-0">
      <div className="flex items-center gap-0.5 px-2 pt-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide max-w-full">
        <button type="button" onClick={() => setCreateFileOpen(true)} className="p-2 min-h-[40px] min-w-[40px] text-[#64748b] hover:bg-[#f1f5f9] rounded shrink-0" title="Menu / New">
          <Menu size={16} />
        </button>
        <button type="button" onClick={() => navigate('/')} className="p-2 min-h-[40px] min-w-[40px] text-[#64748b] hover:bg-[#f1f5f9] rounded shrink-0" title="Home">
          <Home size={16} />
        </button>
        <div className="w-px h-5 bg-[#e2e8f0] mx-1 shrink-0" />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setRibbonTab(tab.id);
              if (tab.id === 'create') {
                /* stay on create sub-toolbar — do not auto-open modal */
              }
            }}
            className={`relative px-2.5 py-2 text-[12px] whitespace-nowrap rounded-t-md transition-colors shrink-0 ${
              ribbonTab === tab.id
                ? 'text-[#0f172a] font-semibold bg-[#f8fafc]'
                : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc]'
            }`}
          >
            {tab.label}
            {tab.dot && ribbonTab === tab.id && (
              <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-[#e11d48]" />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-[#f8fafc] border-t border-[#eef2f7] min-h-[40px] max-w-full min-w-0">
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide min-w-0">
          {subs.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSubAction(s.id)}
              className={`px-3 py-1.5 text-[12px] whitespace-nowrap rounded-md transition-colors ${
                subAction === s.id
                  ? 'bg-[#dbeafe] text-[#1d4ed8] font-medium'
                  : 'text-[#475569] hover:bg-white hover:text-[#0f172a]'
              }`}
            >
              {s.label}
            </button>
          ))}
          {ribbonTab === 'create' && (
            <button
              type="button"
              onClick={() => setQuickToolsOpen(true)}
              className="px-3 py-1.5 text-[12px] text-[#2563eb] hover:bg-white rounded-md whitespace-nowrap"
            >
              All Quick Tools…
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 pl-2 border-l border-[#e2e8f0] ml-2">
          <button type="button" onClick={zoomOut} className="p-1.5 rounded hover:bg-white text-[#64748b]" title="Zoom out">
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(100);
              pushToast('success', 'Масштаб 100%');
            }}
            className="px-2 py-1 text-[12px] text-[#334155] hover:bg-white rounded flex items-center gap-0.5 min-w-[52px] justify-center"
          >
            {zoom}%
            <ChevronDown size={12} className="text-[#94a3b8]" />
          </button>
          <button type="button" onClick={zoomIn} className="p-1.5 rounded hover:bg-white text-[#64748b]" title="Zoom in">
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => pushToast('info', 'Пошук по тексту документа')}
            className="p-1.5 rounded hover:bg-white text-[#64748b] ml-1"
            title="Search"
          >
            <Search size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
