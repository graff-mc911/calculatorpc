/**
 * On-device OCR for estimate / invoice import (scanned PDF + photos).
 * Reuses tesseract.js already in the app — no paid cloud OCR.
 * Browser-only (needs canvas / Worker).
 */
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function canRunBrowserOcr(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/** Text layer too short / empty → likely a scan. */
export function isSparseExtractedText(text: string): boolean {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 40) return true;
  // Mostly punctuation / digits without words → not a usable table
  const letters = (t.match(/\p{L}/gu) || []).length;
  return letters < 20;
}

async function renderPdfPagesToBlobs(file: File, maxPages = 3, scale = 2.2): Promise<Blob[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const blobs: Blob[] = [];
  const n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable for PDF OCR');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF render failed'))), 'image/png');
    });
    blobs.push(blob);
  }
  return blobs;
}

/**
 * OCR image or scanned PDF pages → plain text.
 * Throws a clear error when not in a browser environment.
 */
export async function extractEstimateTextViaOcr(file: File): Promise<string> {
  if (!canRunBrowserOcr()) {
    throw new Error(
      'OCR for scanned PDF/photos requires the browser. Use Excel/CSV, or open the file on a device.',
    );
  }

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
  const sources: Blob[] = isPdf ? await renderPdfPagesToBlobs(file) : [file];

  // Same language pack as receipt OCR (already cached in the PWA)
  const worker = await createWorker('eng+spa+deu', 1);
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as any,
    } as any);
    const parts: string[] = [];
    for (const src of sources) {
      const { data } = await worker.recognize(src);
      if (data.text?.trim()) parts.push(data.text.trim());
    }
    return parts.join('\n\n');
  } finally {
    await worker.terminate();
  }
}
