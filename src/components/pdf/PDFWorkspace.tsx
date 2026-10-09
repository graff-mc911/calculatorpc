import React, { useEffect } from 'react';
import { PDFHeader } from './PDFHeader';
import { PDFRibbonToolbar } from './PDFRibbonToolbar';
import { PDFDocumentTabs } from './PDFDocumentTabs';
import { PDFCanvasViewer } from './PDFCanvasViewer';
import { PDFRightSidebar } from './PDFRightSidebar';
import { PDFQuickToolsModal } from './PDFQuickToolsModal';
import { PDFCreateFileModal } from './PDFCreateFileModal';
import { PDFSignatureModal } from './PDFSignatureModal';
import { PDFProtectModal } from './PDFProtectModal';
import { PDFLeftRail } from './PDFLeftRail';
import { PenLine, Search } from 'lucide-react';
import { usePdfStore } from '../../store/usePdfStore';

function PDFToastHost() {
  const toasts = usePdfStore((s) => s.toasts);
  const dismissToast = usePdfStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toasts.length) return;
    const last = toasts[toasts.length - 1];
    const t = window.setTimeout(() => dismissToast(last.id), 3200);
    return () => window.clearTimeout(t);
  }, [toasts, dismissToast]);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg px-4 py-2.5 text-sm shadow-lg border text-white ${
            toast.kind === 'success'
              ? 'bg-emerald-600 border-emerald-500'
              : toast.kind === 'error'
                ? 'bg-red-600 border-red-500'
                : toast.kind === 'warning'
                  ? 'bg-amber-600 border-amber-500'
                  : 'bg-slate-800 border-slate-700'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Unified Soda PDF–style workspace — full button interactivity + Create File.
 */
export const PDFWorkspace: React.FC = () => {
  const ribbonTab = usePdfStore((s) => s.ribbonTab);
  const setRibbonTab = usePdfStore((s) => s.setRibbonTab);
  const importFiles = usePdfStore((s) => s.importFiles);
  const placingType = usePdfStore((s) => s.placingType);
  const addField = usePdfStore((s) => s.addField);
  const activeDocument = usePdfStore((s) => s.activeDocument);
  const documents = usePdfStore((s) => s.documents);
  const createFileOpen = usePdfStore((s) => s.createFileOpen);
  const setCreateFileOpen = usePdfStore((s) => s.setCreateFileOpen);
  const uid = () => Math.random().toString(36).slice(2, 10);

  // First visit with no docs — offer create modal once
  useEffect(() => {
    if (documents.length === 0 && !createFileOpen) {
      const t = window.setTimeout(() => setCreateFileOpen(true), 400);
      return () => window.clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: open tools sidebar; phone: keep closed (overlay when opened)
  useEffect(() => {
    const syncSidebar = () => {
      const wide = window.matchMedia('(min-width: 1024px)').matches;
      usePdfStore.getState().setSidebarOpen(wide);
    };
    syncSidebar();
    const mq = window.matchMedia('(min-width: 1024px)');
    mq.addEventListener('change', syncSidebar);
    return () => mq.removeEventListener('change', syncSidebar);
  }, []);

  /** Global file input for Upload / Image tool */
  const onGlobalFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    if (placingType === 'image') {
      const file = files[0];
      if (!file?.type.startsWith('image/')) return;
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const doc = activeDocument();
      if (!doc) {
        await importFiles(files);
        return;
      }
      addField({
        id: uid(),
        type: 'image',
        page: doc.activePageIndex,
        x: 20,
        y: 20,
        w: 30,
        h: 20,
        value: dataUrl,
      });
      usePdfStore.getState().setPlacingType(null);
      usePdfStore.getState().pushToast('success', 'Зображення додано');
      return;
    }
    await importFiles(files);
  };

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] flex flex-col bg-[#e8eaed] text-[#0f172a] overflow-hidden">
      <PDFHeader />
      <PDFRibbonToolbar />
      <PDFDocumentTabs />

      <div className="flex-1 min-h-0 flex relative min-w-0 overflow-hidden">
        <PDFLeftRail />
        <PDFCanvasViewer />

        <div className="absolute right-[260px] top-1/3 z-20 hidden lg:flex flex-col gap-1 bg-white border border-[#e5e7eb] rounded-l-lg shadow-sm p-1">
          <button
            type="button"
            onClick={() => usePdfStore.getState().pushToast('info', 'Пошук')}
            className="p-2 text-[#64748b] hover:text-[#2563eb] rounded"
            title="Search"
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            onClick={() => setRibbonTab('esign')}
            className={`p-2 rounded ${
              ribbonTab === 'esign' ? 'bg-[#dbeafe] text-[#2563eb]' : 'text-[#64748b] hover:text-[#2563eb]'
            }`}
            title="Sign"
          >
            <PenLine size={14} />
          </button>
        </div>

        <PDFRightSidebar />
      </div>

      <input
        id="pdf-global-file-input"
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          void onGlobalFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <PDFQuickToolsModal />
      <PDFCreateFileModal />
      <PDFSignatureModal />
      <PDFProtectModal />
      <PDFToastHost />
    </div>
  );
};

export default PDFWorkspace;
