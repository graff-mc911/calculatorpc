import React, { useRef, useState } from 'react';
import { FilePlus, FileText, LayoutTemplate, Upload, X } from 'lucide-react';
import { usePdfStore } from '../../store/usePdfStore';
import type { PageFormat } from '../../lib/pdf/pageEngine';
import type { TemplateId } from '../../lib/pdf/pageEngine';

type Tab = 'blank' | 'template' | 'upload';

const TEMPLATES: { id: TemplateId; title: string; desc: string }[] = [
  { id: 'invoice', title: 'Рахунок-фактура', desc: 'Invoice з таблицею позицій' },
  { id: 'contract', title: 'Договір', desc: 'Стандартний договір сторін' },
  { id: 'act', title: 'Акт виконаних робіт', desc: 'Service Act / handover' },
  { id: 'letter', title: 'Офіційний лист', desc: 'Standard business letter' },
];

export const PDFCreateFileModal: React.FC = () => {
  const open = usePdfStore((s) => s.createFileOpen);
  const setCreateFileOpen = usePdfStore((s) => s.setCreateFileOpen);
  const createBlankDocument = usePdfStore((s) => s.createBlankDocument);
  const createFromTemplate = usePdfStore((s) => s.createFromTemplate);
  const importFiles = usePdfStore((s) => s.importFiles);

  const [tab, setTab] = useState<Tab>('blank');
  const [format, setFormat] = useState<PageFormat>('a4-portrait');
  const [bg, setBg] = useState('#ffffff');
  const [pages, setPages] = useState(1);
  const [name, setName] = useState('Новий документ');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4 overflow-y-auto"
      onClick={() => setCreateFileOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setCreateFileOpen(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#e5e7eb] overflow-y-auto max-h-[min(92dvh,100%)] my-0 sm:my-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#eef2f7]">
          <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2">
            <FilePlus size={18} className="text-[#3b82f6]" />
            Створити файл
          </h2>
          <button
            type="button"
            onClick={() => setCreateFileOpen(false)}
            className="p-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          {(
            [
              ['blank', 'Чистий аркуш', FileText],
              ['template', 'З шаблону', LayoutTemplate],
              ['upload', 'Завантажити', Upload],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium ${
                tab === id ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'text-[#64748b] hover:bg-[#f8fafc]'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === 'blank' && (
            <>
              <label className="block text-xs text-[#64748b]">
                Назва
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm text-[#0f172a]"
                />
              </label>
              <div>
                <p className="text-xs text-[#64748b] mb-2">Формат сторінки</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['a4-portrait', 'A4 Portrait'],
                      ['a4-landscape', 'A4 Landscape'],
                      ['letter', 'Letter'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFormat(id)}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${
                        format === id
                          ? 'border-[#3b82f6] bg-[#eff6ff] text-[#1d4ed8]'
                          : 'border-[#e5e7eb] text-[#475569]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <label className="text-xs text-[#64748b]">
                  Фон
                  <input
                    type="color"
                    value={bg}
                    onChange={(e) => setBg(e.target.value)}
                    className="ml-2 w-10 h-8 rounded border border-[#e5e7eb] cursor-pointer"
                  />
                </label>
                <label className="text-xs text-[#64748b]">
                  Сторінок
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={pages}
                    onChange={(e) => setPages(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className="ml-2 w-16 rounded-lg border border-[#d1d5db] px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() =>
                  createBlankDocument({
                    name: `${name || 'Новий документ'}.pdf`,
                    format,
                    background: bg,
                    pageCount: pages,
                  })
                }
                className="w-full py-2.5 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-semibold"
              >
                Створити документ
              </button>
            </>
          )}

          {tab === 'template' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => createFromTemplate(t.id)}
                  className="text-left p-4 rounded-xl border border-[#e5e7eb] hover:border-[#3b82f6] hover:bg-[#eff6ff]/50 transition-all"
                >
                  <p className="font-semibold text-sm text-[#0f172a]">{t.title}</p>
                  <p className="text-xs text-[#64748b] mt-1">{t.desc}</p>
                </button>
              ))}
            </div>
          )}

          {tab === 'upload' && (
            <div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void importFiles(e.dataTransfer.files);
                }}
                className="w-full border-2 border-dashed border-[#c5cad3] hover:border-[#3b82f6] rounded-xl py-12 text-center"
              >
                <Upload className="mx-auto text-[#3b82f6] mb-2" size={28} />
                <p className="text-sm text-[#334155] font-medium">PDF, PNG або JPG</p>
                <p className="text-xs text-[#94a3b8] mt-1">Перетягніть або натисніть для вибору</p>
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void importFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
