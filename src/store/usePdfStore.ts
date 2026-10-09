import { create } from 'zustand';
import {
  makeBlankPageDataUrl,
  makeTemplatePageDataUrl,
  pageSize,
  type PageFormat,
  type TemplateId,
  PAGE_H,
  PAGE_W,
} from '../lib/pdf/pageEngine';
import { exportDocumentToPdf, mergePageLists } from '../lib/pdf/exportDocument';
import { getPdfPageCount, renderPdfPageToDataUrl } from '../lib/documentEditor/pdfTools';

export type RibbonTab =
  | 'view'
  | 'create'
  | 'fill'
  | 'edit'
  | 'page'
  | 'comment'
  | 'secure'
  | 'forms'
  | 'esign'
  | 'ocr'
  | 'translate'
  | 'ai';

export type OverlayFieldType =
  | 'signature'
  | 'initials'
  | 'date'
  | 'name'
  | 'email'
  | 'text'
  | 'image'
  | 'checkbox'
  | 'stamp'
  | 'note'
  | 'highlight';

export interface OverlayField {
  id: string;
  type: OverlayFieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  value?: string;
  checked?: boolean;
  fontSize?: number;
}

export interface DocPage {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  rotation: number;
  background?: string;
}

export interface OpenDocument {
  id: string;
  name: string;
  file: File | null;
  pages: DocPage[];
  /** @deprecated use pages */
  pageUrls: string[];
  pageCount: number;
  fields: OverlayField[];
  activePageIndex: number;
  protected: boolean;
  protectPassword?: string;
  compressed: boolean;
}

export type QuickToolId =
  | 'merge'
  | 'compress'
  | 'edit'
  | 'convert'
  | 'split'
  | 'sign'
  | 'pdf-to-word'
  | 'pdf-to-excel'
  | 'pdf-to-ppt'
  | 'resize'
  | 'pdf-to-jpg'
  | 'rotate'
  | 'ppt-to-pdf'
  | 'excel-to-pdf'
  | 'word-to-pdf'
  | 'protect'
  | 'unlock'
  | 'read'
  | 'ocr'
  | 'delete-pages'
  | 'watermark'
  | 'html-to-pdf'
  | 'new-file';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastPayload {
  id: string;
  kind: ToastKind;
  message: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function syncPageUrls(pages: DocPage[]): { pageUrls: string[]; pageCount: number } {
  return { pageUrls: pages.map((p) => p.dataUrl), pageCount: pages.length };
}

export interface PdfStore {
  documents: OpenDocument[];
  activeDocId: string | null;
  ribbonTab: RibbonTab;
  subAction: string;
  zoom: number;
  sidebarOpen: boolean;
  leftRail: 'pages' | 'bookmarks' | null;
  quickToolsOpen: boolean;
  createFileOpen: boolean;
  signatureModalOpen: boolean;
  protectModalOpen: boolean;
  workflowStep: 1 | 2;
  selectedFieldId: string | null;
  placingType: OverlayFieldType | null;
  statusMsg: string;
  savedSignature: string | null;
  toasts: ToastPayload[];
  viewMode: 'continuous' | 'single';

  /* UI */
  setRibbonTab: (tab: RibbonTab) => void;
  setSubAction: (action: string) => void;
  handleSubAction: (action: string) => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setLeftRail: (rail: 'pages' | 'bookmarks' | null) => void;
  setQuickToolsOpen: (open: boolean) => void;
  setCreateFileOpen: (open: boolean) => void;
  setSignatureModalOpen: (open: boolean) => void;
  setProtectModalOpen: (open: boolean) => void;
  setWorkflowStep: (step: 1 | 2) => void;
  setViewMode: (mode: 'continuous' | 'single') => void;
  setStatusMsg: (msg: string) => void;
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;

  /* Docs */
  setActiveDoc: (id: string) => void;
  closeDoc: (id: string) => void;
  addDocument: (doc: OpenDocument) => void;
  updateDocument: (id: string, patch: Partial<OpenDocument>) => void;
  activeDocument: () => OpenDocument | null;
  setActivePage: (index: number) => void;

  /* Create */
  createBlankDocument: (opts: {
    name?: string;
    format: PageFormat;
    background: string;
    pageCount: number;
  }) => void;
  createFromTemplate: (template: TemplateId, name?: string) => void;
  importFiles: (files: FileList | File[]) => Promise<void>;

  /* Page ops */
  addPage: () => void;
  deleteActivePage: () => void;
  rotateActivePage: (degrees: 90 | -90 | 180) => void;

  /* Fields */
  setPlacingType: (t: OverlayFieldType | null) => void;
  addField: (field: OverlayField) => void;
  updateField: (id: string, patch: Partial<OverlayField>) => void;
  removeField: (id: string) => void;
  setSelectedField: (id: string | null) => void;
  placeFieldAt: (pageIndex: number, xPct: number, yPct: number) => void;
  saveSignatureAsset: (dataUrl: string) => void;

  /* File ops */
  downloadActivePdf: () => Promise<void>;
  printActive: () => void;
  mergeOpenDocuments: () => Promise<void>;
  splitActiveDocument: () => Promise<void>;
  protectActiveDocument: (password: string) => void;
  unlockActiveDocument: () => void;
  compressActiveDocument: () => Promise<void>;
  triggerUploadDialog: () => void;
}

const DEFAULT_SIZE: Record<OverlayFieldType, { w: number; h: number }> = {
  signature: { w: 28, h: 8 },
  initials: { w: 12, h: 6 },
  date: { w: 16, h: 5 },
  name: { w: 22, h: 5 },
  email: { w: 24, h: 5 },
  text: { w: 30, h: 6 },
  image: { w: 25, h: 18 },
  checkbox: { w: 4, h: 3 },
  stamp: { w: 18, h: 8 },
  note: { w: 20, h: 10 },
  highlight: { w: 30, h: 4 },
};

export const usePdfStore = create<PdfStore>((set, get) => ({
  documents: [],
  activeDocId: null,
  ribbonTab: 'esign',
  subAction: 'sign-doc',
  zoom: 100,
  /* Closed by default — desktop opens via PDFWorkspace effect; mobile uses overlay */
  sidebarOpen: false,
  leftRail: 'pages',
  quickToolsOpen: false,
  createFileOpen: false,
  signatureModalOpen: false,
  protectModalOpen: false,
  workflowStep: 1,
  selectedFieldId: null,
  placingType: null,
  statusMsg: '',
  savedSignature: null,
  toasts: [],
  viewMode: 'continuous',

  setRibbonTab: (tab) => {
    const defaults: Partial<Record<RibbonTab, string>> = {
      view: 'fit-width',
      create: 'new-file',
      fill: 'sign-doc',
      edit: 'text',
      page: 'add-page',
      comment: 'note',
      secure: 'protect',
      forms: 'text-field',
      esign: 'sign-doc',
      ocr: 'recognize',
      translate: 'lang',
      ai: 'ask',
    };
    const wantsSidebar = ['esign', 'fill', 'edit', 'ocr', 'forms', 'comment'].includes(tab);
    const wide =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    set({
      ribbonTab: tab,
      subAction: defaults[tab] || 'sign-doc',
      // Phones: keep canvas full-width (overlay opens only via edge control)
      sidebarOpen: wide ? wantsSidebar : false,
    });
  },

  setSubAction: (action) => set({ subAction: action }),

  handleSubAction: (action) => {
    const s = get();
    set({ subAction: action });

    switch (action) {
      case 'new-file':
      case 'to-pdf':
      case 'create-pdf':
        s.setCreateFileOpen(true);
        s.pushToast('info', 'Створення нового файлу');
        break;
      case 'upload':
      case 'from-pdf':
        s.triggerUploadDialog();
        break;
      case 'download':
      case 'export':
        void s.downloadActivePdf();
        break;
      case 'print':
        s.printActive();
        break;
      case 'merge':
        void s.mergeOpenDocuments();
        break;
      case 'split':
        void s.splitActiveDocument();
        break;
      case 'compress':
        void s.compressActiveDocument();
        break;
      case 'sign-doc':
      case 'my-sig':
        s.setRibbonTab(action === 'my-sig' ? 'esign' : s.ribbonTab);
        s.setSignatureModalOpen(true);
        s.pushToast('info', 'Відкрито редактор підпису');
        break;
      case 'request':
        s.pushToast('info', 'Запит підпису: додайте поля та натисніть Finish');
        s.setPlacingType('signature');
        break;
      case 'inbox':
        s.pushToast('info', 'Inbox порожній — немає вхідних запитів');
        break;
      case 'manage':
        s.pushToast('info', 'Керування підписантами: додайте поля Name / Email');
        s.setPlacingType('name');
        break;
      case 'text':
      case 'text-field':
        s.setPlacingType('text');
        s.pushToast('info', 'Клікніть на сторінку, щоб додати текст');
        break;
      case 'image':
        s.triggerUploadDialog();
        s.setPlacingType('image');
        s.pushToast('info', 'Оберіть зображення для вставки');
        break;
      case 'link':
        s.setPlacingType('text');
        s.pushToast('info', 'Додайте текстове посилання на сторінку');
        break;
      case 'redact':
        s.setPlacingType('highlight');
        s.pushToast('warning', 'Режим редакції: позначте область');
        break;
      case 'add-page':
        s.addPage();
        break;
      case 'delete':
      case 'delete-page':
        s.deleteActivePage();
        break;
      case 'rotate':
      case 'rotate-cw':
        s.rotateActivePage(90);
        break;
      case 'rotate-ccw':
        s.rotateActivePage(-90);
        break;
      case 'extract':
        void s.splitActiveDocument();
        break;
      case 'organize':
        s.setLeftRail('pages');
        s.pushToast('info', 'Організація: оберіть сторінку в мініатюрах');
        break;
      case 'note':
        s.setPlacingType('note');
        s.pushToast('info', 'Клікніть, щоб додати нотатку');
        break;
      case 'highlight':
        s.setPlacingType('highlight');
        s.pushToast('info', 'Клікніть, щоб додати виділення');
        break;
      case 'stamp':
        s.setPlacingType('stamp');
        s.pushToast('info', 'Клікніть, щоб поставити штамп');
        break;
      case 'protect':
        s.setProtectModalOpen(true);
        break;
      case 'unlock':
        s.unlockActiveDocument();
        break;
      case 'watermark':
        s.setPlacingType('stamp');
        s.pushToast('info', 'Додайте водяний знак як штамп на сторінці');
        break;
      case 'checkbox':
        s.setPlacingType('checkbox');
        s.pushToast('info', 'Клікніть, щоб додати чекбокс');
        break;
      case 'dropdown':
        s.setPlacingType('text');
        s.pushToast('info', 'Dropdown додано як текстове поле');
        break;
      case 'recognize':
      case 'searchable':
        s.setQuickToolsOpen(true);
        s.pushToast('info', 'OCR — відкрийте Швидкі інструменти');
        break;
      case 'lang':
      case 'doc':
        s.pushToast('info', 'Переклад: скопіюйте текст або використайте OCR');
        break;
      case 'ask':
      case 'summarize':
        s.pushToast('info', 'AI Assistant: скоро доступний — поки скористайтесь OCR');
        break;
      case 'fit-width':
        s.setZoom(100);
        s.pushToast('success', 'Масштаб: за шириною (100%)');
        break;
      case 'fit-page':
        s.setZoom(80);
        s.pushToast('success', 'Масштаб: вся сторінка');
        break;
      case 'single':
        s.setViewMode('single');
        s.pushToast('info', 'Режим: одна сторінка');
        break;
      case 'continuous':
        s.setViewMode('continuous');
        s.pushToast('info', 'Режим: неперервний скрол');
        break;
      default:
        s.pushToast('info', `Дія: ${action}`);
    }
  },

  setZoom: (z) => set({ zoom: Math.min(250, Math.max(40, Math.round(z))) }),
  zoomIn: () => {
    get().setZoom(get().zoom + 10);
    get().pushToast('info', `Масштаб ${get().zoom}%`);
  },
  zoomOut: () => {
    get().setZoom(get().zoom - 10);
    get().pushToast('info', `Масштаб ${get().zoom}%`);
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setLeftRail: (rail) => set({ leftRail: rail }),
  setQuickToolsOpen: (open) => set({ quickToolsOpen: open }),
  setCreateFileOpen: (open) => set({ createFileOpen: open }),
  setSignatureModalOpen: (open) => set({ signatureModalOpen: open }),
  setProtectModalOpen: (open) => set({ protectModalOpen: open }),
  setWorkflowStep: (step) => set({ workflowStep: step }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setStatusMsg: (msg) => set({ statusMsg: msg }),

  pushToast: (kind, message) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id: uid(), kind, message }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setActiveDoc: (id) => set({ activeDocId: id }),
  closeDoc: (id) =>
    set((s) => {
      const documents = s.documents.filter((d) => d.id !== id);
      return {
        documents,
        activeDocId: s.activeDocId === id ? documents[0]?.id || null : s.activeDocId,
      };
    }),
  addDocument: (doc) =>
    set((s) => ({
      documents: [...s.documents, doc],
      activeDocId: doc.id,
      workflowStep: doc.pageCount > 0 ? 2 : 1,
      createFileOpen: false,
    })),
  updateDocument: (id, patch) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  activeDocument: () => {
    const s = get();
    return s.documents.find((d) => d.id === s.activeDocId) || null;
  },
  setActivePage: (index) => {
    const doc = get().activeDocument();
    if (!doc) return;
    const i = Math.max(0, Math.min(doc.pages.length - 1, index));
    get().updateDocument(doc.id, { activePageIndex: i });
    const el = document.getElementById(`pdf-page-${doc.id}-${i}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  createBlankDocument: ({ name, format, background, pageCount }) => {
    const size = pageSize(format);
    const pages: DocPage[] = Array.from({ length: Math.max(1, pageCount) }, () => ({
      id: uid(),
      dataUrl: makeBlankPageDataUrl(format, background),
      width: size.w,
      height: size.h,
      rotation: 0,
      background,
    }));
    const doc: OpenDocument = {
      id: uid(),
      name: name || 'Новий документ.pdf',
      file: null,
      pages,
      ...syncPageUrls(pages),
      fields: [],
      activePageIndex: 0,
      protected: false,
      compressed: false,
    };
    get().addDocument(doc);
    get().pushToast('success', `Створено: ${doc.name} (${pages.length} стор.)`);
  },

  createFromTemplate: (template, name) => {
    const titles: Record<TemplateId, string> = {
      invoice: 'Рахунок-фактура.pdf',
      contract: 'Договір.pdf',
      act: 'Акт виконаних робіт.pdf',
      letter: 'Офіційний лист.pdf',
    };
    const pages: DocPage[] = [
      {
        id: uid(),
        dataUrl: makeTemplatePageDataUrl(template),
        width: PAGE_W,
        height: PAGE_H,
        rotation: 0,
      },
    ];
    const doc: OpenDocument = {
      id: uid(),
      name: name || titles[template],
      file: null,
      pages,
      ...syncPageUrls(pages),
      fields: [],
      activePageIndex: 0,
      protected: false,
      compressed: false,
    };
    get().addDocument(doc);
    get().setRibbonTab('edit');
    get().pushToast('success', `Шаблон відкрито: ${doc.name}`);
  },

  importFiles: async (incoming) => {
    const list = Array.from(incoming);
    if (!list.length) return;
    for (const file of list) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

      if (isImage) {
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const pages: DocPage[] = [
          { id: uid(), dataUrl, width: PAGE_W, height: PAGE_H, rotation: 0 },
        ];
        get().addDocument({
          id: uid(),
          name: file.name.replace(/\.[^.]+$/, '') + '.pdf',
          file,
          pages,
          ...syncPageUrls(pages),
          fields: [],
          activePageIndex: 0,
          protected: false,
          compressed: false,
        });
        get().pushToast('success', `Зображення імпортовано: ${file.name}`);
        continue;
      }

      if (!isPdf) {
        get().pushToast('warning', `Пропущено: ${file.name}`);
        continue;
      }

      const docId = uid();
      get().addDocument({
        id: docId,
        name: file.name,
        file,
        pages: [],
        pageUrls: [],
        pageCount: 0,
        fields: [],
        activePageIndex: 0,
        protected: false,
        compressed: false,
      });
      try {
        get().setStatusMsg(`Завантаження ${file.name}…`);
        const count = await getPdfPageCount(file);
        const pages: DocPage[] = [];
        for (let p = 1; p <= count; p += 1) {
          get().setStatusMsg(`${file.name}: ${p}/${count}`);
          const dataUrl = await renderPdfPageToDataUrl(file, p, 1.5, 0.88);
          pages.push({ id: uid(), dataUrl, width: PAGE_W, height: PAGE_H, rotation: 0 });
        }
        get().updateDocument(docId, { pages, ...syncPageUrls(pages), activePageIndex: 0 });
        get().setWorkflowStep(2);
        get().setStatusMsg('');
        get().pushToast('success', `Відкрито ${file.name} (${count} стор.)`);
      } catch {
        get().setStatusMsg('');
        get().pushToast('error', `Не вдалося відкрити ${file.name}`);
      }
    }
  },

  addPage: () => {
    const doc = get().activeDocument();
    if (!doc) {
      get().createBlankDocument({ format: 'a4-portrait', background: '#ffffff', pageCount: 1 });
      return;
    }
    const page: DocPage = {
      id: uid(),
      dataUrl: makeBlankPageDataUrl('a4-portrait', '#ffffff'),
      width: PAGE_W,
      height: PAGE_H,
      rotation: 0,
    };
    const pages = [...doc.pages, page];
    get().updateDocument(doc.id, {
      pages,
      ...syncPageUrls(pages),
      activePageIndex: pages.length - 1,
    });
    get().pushToast('success', `Додано сторінку ${pages.length}`);
  },

  deleteActivePage: () => {
    const doc = get().activeDocument();
    if (!doc || !doc.pages.length) {
      get().pushToast('warning', 'Немає сторінки для видалення');
      return;
    }
    if (doc.pages.length === 1) {
      get().pushToast('warning', 'Не можна видалити останню сторінку');
      return;
    }
    const idx = doc.activePageIndex;
    const pages = doc.pages.filter((_, i) => i !== idx);
    const fields = doc.fields
      .filter((f) => f.page !== idx)
      .map((f) => (f.page > idx ? { ...f, page: f.page - 1 } : f));
    get().updateDocument(doc.id, {
      pages,
      fields,
      ...syncPageUrls(pages),
      activePageIndex: Math.min(idx, pages.length - 1),
    });
    get().pushToast('success', 'Сторінку видалено');
  },

  rotateActivePage: (degrees) => {
    const doc = get().activeDocument();
    if (!doc?.pages.length) {
      get().pushToast('warning', 'Спочатку відкрийте документ');
      return;
    }
    const idx = doc.activePageIndex;
    const pages = doc.pages.map((p, i) =>
      i === idx ? { ...p, rotation: (((p.rotation + degrees) % 360) + 360) % 360 } : p,
    );
    get().updateDocument(doc.id, { pages, ...syncPageUrls(pages) });
    get().pushToast('success', `Повернуто на ${degrees > 0 ? '+' : ''}${degrees}°`);
  },

  setPlacingType: (t) => set({ placingType: t }),
  addField: (field) => {
    const doc = get().activeDocument();
    if (!doc) return;
    get().updateDocument(doc.id, { fields: [...doc.fields, field] });
    set({ selectedFieldId: field.id, placingType: null });
  },
  updateField: (id, patch) => {
    const doc = get().activeDocument();
    if (!doc) return;
    get().updateDocument(doc.id, {
      fields: doc.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  },
  removeField: (id) => {
    const doc = get().activeDocument();
    if (!doc) return;
    get().updateDocument(doc.id, { fields: doc.fields.filter((f) => f.id !== id) });
    if (get().selectedFieldId === id) set({ selectedFieldId: null });
    get().pushToast('info', 'Поле видалено');
  },
  setSelectedField: (id) => set({ selectedFieldId: id }),

  placeFieldAt: (pageIndex, xPct, yPct) => {
    const type = get().placingType;
    const doc = get().activeDocument();
    if (!type || !doc) return;
    const size = DEFAULT_SIZE[type];
    let value = '';
    if (type === 'date') value = new Date().toLocaleDateString();
    if (type === 'signature' && get().savedSignature) value = get().savedSignature!;
    if (type === 'signature' && !get().savedSignature) value = 'Підпис';
    if (type === 'initials') value = 'XX';
    if (type === 'text') value = 'Текст';
    if (type === 'stamp') value = 'APPROVED';
    if (type === 'note') value = 'Нотатка';
    if (type === 'name') value = 'Імʼя';
    if (type === 'email') value = 'email@example.com';

    get().addField({
      id: uid(),
      type,
      page: pageIndex,
      x: Math.max(0, Math.min(100 - size.w, xPct - size.w / 2)),
      y: Math.max(0, Math.min(100 - size.h, yPct - size.h / 2)),
      w: size.w,
      h: size.h,
      value,
      checked: type === 'checkbox' ? false : undefined,
    });
    get().pushToast('success', `Додано: ${type}`);
  },

  saveSignatureAsset: (dataUrl) => {
    set({ savedSignature: dataUrl, signatureModalOpen: false, placingType: 'signature' });
    get().pushToast('success', 'Підпис збережено — клікніть на сторінку');
  },

  downloadActivePdf: async () => {
    const doc = get().activeDocument();
    if (!doc?.pages.length) {
      get().pushToast('warning', 'Немає документа для експорту');
      return;
    }
    try {
      get().setStatusMsg('Експорт PDF…');
      await exportDocumentToPdf(doc);
      get().setStatusMsg('');
      get().pushToast('success', 'PDF завантажено');
    } catch {
      get().setStatusMsg('');
      get().pushToast('error', 'Помилка експорту PDF');
    }
  },

  printActive: () => {
    const doc = get().activeDocument();
    if (!doc?.pages.length) {
      get().pushToast('warning', 'Немає документа для друку');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      get().pushToast('error', 'Дозвольте спливаючі вікна для друку');
      return;
    }
    const pagesHtml = doc.pages
      .map(
        (p) =>
          `<div style="page-break-after:always;width:595px;margin:0 auto;transform:rotate(${p.rotation}deg)"><img src="${p.dataUrl}" style="width:100%"/></div>`,
      )
      .join('');
    w.document.write(
      `<html><head><title>${doc.name}</title><style>@media print{body{margin:0}}</style></head><body>${pagesHtml}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      get().pushToast('success', 'Друк запущено');
    }, 300);
  },

  mergeOpenDocuments: async () => {
    const docs = get().documents.filter((d) => d.pages.length);
    if (docs.length < 2) {
      get().pushToast('warning', 'Відкрийте щонайменше 2 документи для обʼєднання');
      get().setQuickToolsOpen(true);
      return;
    }
    const mergedPages = mergePageLists(docs).map((p) => ({
      id: uid(),
      dataUrl: p.dataUrl,
      width: p.width,
      height: p.height,
      rotation: p.rotation,
    }));
    const fields = docs.flatMap((d, di) => {
      const offset = docs.slice(0, di).reduce((n, x) => n + x.pages.length, 0);
      return d.fields.map((f) => ({ ...f, id: uid(), page: f.page + offset }));
    });
    get().addDocument({
      id: uid(),
      name: 'merged.pdf',
      file: null,
      pages: mergedPages,
      ...syncPageUrls(mergedPages),
      fields,
      activePageIndex: 0,
      protected: false,
      compressed: false,
    });
    get().pushToast('success', `Обʼєднано ${docs.length} документів → ${mergedPages.length} стор.`);
  },

  splitActiveDocument: async () => {
    const doc = get().activeDocument();
    if (!doc || doc.pages.length < 2) {
      get().pushToast('warning', 'Потрібен документ з кількома сторінками');
      return;
    }
    doc.pages.forEach((page, i) => {
      const pages = [{ ...page, id: uid() }];
      get().addDocument({
        id: uid(),
        name: `${doc.name.replace(/\.pdf$/i, '')}_p${i + 1}.pdf`,
        file: null,
        pages,
        ...syncPageUrls(pages),
        fields: doc.fields.filter((f) => f.page === i).map((f) => ({ ...f, id: uid(), page: 0 })),
        activePageIndex: 0,
        protected: false,
        compressed: false,
      });
    });
    get().pushToast('success', `Розділено на ${doc.pages.length} документів`);
  },

  protectActiveDocument: (password) => {
    const doc = get().activeDocument();
    if (!doc) {
      get().pushToast('warning', 'Спочатку відкрийте документ');
      return;
    }
    get().updateDocument(doc.id, { protected: true, protectPassword: password });
    get().setProtectModalOpen(false);
    get().pushToast('success', 'Документ позначено як захищений');
  },

  unlockActiveDocument: () => {
    const doc = get().activeDocument();
    if (!doc) {
      get().pushToast('warning', 'Немає активного документа');
      return;
    }
    get().updateDocument(doc.id, { protected: false, protectPassword: undefined });
    get().pushToast('success', 'Захист знято');
  },

  compressActiveDocument: async () => {
    const doc = get().activeDocument();
    if (!doc?.pages.length) {
      get().pushToast('warning', 'Немає документа для стиснення');
      return;
    }
    get().setStatusMsg('Стиснення…');
    const pages: DocPage[] = [];
    for (const page of doc.pages) {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = page.dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * 0.7);
      c.height = Math.round(img.height * 0.7);
      const ctx = c.getContext('2d');
      ctx?.drawImage(img, 0, 0, c.width, c.height);
      pages.push({
        ...page,
        id: uid(),
        dataUrl: c.toDataURL('image/jpeg', 0.55),
      });
    }
    get().updateDocument(doc.id, { pages, ...syncPageUrls(pages), compressed: true });
    get().setStatusMsg('');
    get().pushToast('success', 'Документ стиснуто (якість зменшено)');
  },

  triggerUploadDialog: () => {
    const input = document.getElementById('pdf-global-file-input') as HTMLInputElement | null;
    input?.click();
  },
}));

export function createEmptyDoc(name = 'Untitled.pdf'): OpenDocument {
  return {
    id: uid(),
    name,
    file: null,
    pages: [],
    pageUrls: [],
    pageCount: 0,
    fields: [],
    activePageIndex: 0,
    protected: false,
    compressed: false,
  };
}

export { uid };

/** Back-compat alias */
export const usePdfWorkspace = usePdfStore;
