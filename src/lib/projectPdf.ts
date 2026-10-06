import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ensurePdfUnicodeFont } from './pdfUnicodeFont';
import { shareOrDownloadPdf } from './shareInvoice';
import { formatMoneyInput } from './moneyMask';
import { computeProjectMetrics, lineTotal } from './projectMetrics';
import type {
  Project,
  ProjectExpense,
  ProjectPrepayment,
  ProjectWorkItem,
} from './projectsApi';

type CompanyProfile = {
  company_name?: string | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_tax_number?: string | null;
  company_iban?: string | null;
  company_bic?: string | null;
  company_bank?: string | null;
  logo_url?: string | null;
};

type PdfLabels = {
  estimateTitle: string;
  client: string;
  address: string;
  works: string;
  qty: string;
  unit: string;
  unitPrice: string;
  total: string;
  estimateTotal: string;
  received: string;
  balanceDue: string;
  expenses: string;
  projectedProfit: string;
  margin: string;
  prepayments: string;
  ungrouped: string;
  date: string;
  note: string;
};

function money(n: number): string {
  return formatMoneyInput(n, 2);
}

function formatDate(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('de-DE');
}

async function loadLogo(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function groupWorks(items: ProjectWorkItem[]): Array<{ key: string; items: ProjectWorkItem[] }> {
  const map = new Map<string, ProjectWorkItem[]>();
  for (const item of items) {
    const key = (item.group_key || '').trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([key, groupItems]) => ({ key, items: groupItems }));
}

export async function generateProjectEstimatePdf(options: {
  project: Project;
  workItems: ProjectWorkItem[];
  expenses: ProjectExpense[];
  prepayments: ProjectPrepayment[];
  company: CompanyProfile;
  labels: PdfLabels;
}): Promise<jsPDF> {
  const { project, workItems, expenses, prepayments, company, labels } = options;
  const metrics = computeProjectMetrics(
    workItems,
    expenses,
    prepayments,
    Number(project.expense_budget) || 0
  );

  const doc = new jsPDF('p', 'mm', 'a4');
  const font = await ensurePdfUnicodeFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 16;
  const right = pageWidth - 16;
  let y = 16;

  const logoData = await loadLogo(company.logo_url);
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', left, y, 28, 14);
    } catch {
      // ignore bad logo
    }
  }

  doc.setFont(font, 'bold');
  doc.setFontSize(14);
  doc.text(company.company_name || 'SCB Light', logoData ? left + 32 : left, y + 6);
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  const companyLines = [
    company.company_address,
    company.company_phone,
    company.company_email,
    company.company_tax_number ? `Tax: ${company.company_tax_number}` : '',
    company.company_iban ? `IBAN: ${company.company_iban}` : '',
  ].filter(Boolean) as string[];
  let cy = y + 11;
  for (const line of companyLines) {
    doc.text(line, logoData ? left + 32 : left, cy);
    cy += 4;
  }

  doc.setFont(font, 'bold');
  doc.setFontSize(16);
  doc.text(labels.estimateTitle, right, y + 6, { align: 'right' });
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  doc.text(project.name, right, y + 12, { align: 'right' });
  doc.text(formatDate(new Date().toISOString()), right, y + 17, { align: 'right' });

  y = Math.max(cy, y + 28) + 4;
  doc.setDrawColor(180);
  doc.line(left, y, right, y);
  y += 8;

  doc.setFont(font, 'bold');
  doc.setFontSize(11);
  doc.text(labels.client, left, y);
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  y += 5;
  doc.text(project.client_name || '—', left, y);
  y += 5;
  if (project.address) {
    doc.setFont(font, 'bold');
    doc.text(labels.address, left, y);
    doc.setFont(font, 'normal');
    y += 5;
    const addrLines = doc.splitTextToSize(project.address, pageWidth - 32);
    doc.text(addrLines, left, y);
    y += addrLines.length * 4.5 + 2;
  }

  y += 4;
  doc.setFont(font, 'bold');
  doc.setFontSize(12);
  doc.text(labels.works, left, y);
  y += 3;

  const body: string[][] = [];
  for (const group of groupWorks(workItems)) {
    if (group.key) {
      body.push([`${group.key}`, '', '', '', '']);
    } else if (workItems.some((w) => (w.group_key || '').trim())) {
      body.push([labels.ungrouped, '', '', '', '']);
    }
    for (const item of group.items) {
      body.push([
        item.title,
        String(item.quantity),
        item.unit,
        money(Number(item.unit_price)),
        money(lineTotal(item.quantity, item.unit_price)),
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [[labels.works, labels.qty, labels.unit, labels.unitPrice, labels.total]],
    body: body.length ? body : [['—', '', '', '', '']],
    styles: { font, fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [40, 50, 60], textColor: 255, font },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28 },
    },
    margin: { left, right: 16 },
  });

  y = ((doc as any).lastAutoTable?.finalY || y) + 8;

  if (prepayments.length > 0) {
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text(labels.prepayments, left, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [[labels.date, labels.note, labels.total]],
      body: prepayments.map((p) => [
        formatDate(p.paid_at),
        p.note || '—',
        money(Number(p.amount)),
      ]),
      styles: { font, fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [40, 50, 60], textColor: 255, font },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 100 },
        2: { halign: 'right', cellWidth: 40 },
      },
      margin: { left, right: 16 },
    });
    y = ((doc as any).lastAutoTable?.finalY || y) + 8;
  }

  const summary: Array<[string, string]> = [
    [labels.estimateTotal, `${money(metrics.estimateTotal)} ${project.currency}`],
    [labels.received, `${money(metrics.received)} ${project.currency}`],
    [labels.balanceDue, `${money(metrics.balanceDue)} ${project.currency}`],
    [labels.expenses, `${money(metrics.expenses)} ${project.currency}`],
    [labels.projectedProfit, `${money(metrics.projectedProfit)} ${project.currency}`],
    [labels.margin, `${money(metrics.marginPct)} %`],
  ];

  autoTable(doc, {
    startY: y,
    body: summary,
    theme: 'plain',
    styles: { font, fontSize: 10, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 50, halign: 'right' },
    },
    margin: { left: pageWidth - 16 - 110 },
  });

  return doc;
}

export async function shareProjectEstimatePdf(options: {
  project: Project;
  workItems: ProjectWorkItem[];
  expenses: ProjectExpense[];
  prepayments: ProjectPrepayment[];
  company: CompanyProfile;
  labels: PdfLabels;
}): Promise<'shared' | 'downloaded'> {
  const doc = await generateProjectEstimatePdf(options);
  const blob = doc.output('blob');
  const fileName = `estimate-${options.project.name.replace(/[^\w\-]+/g, '_').slice(0, 40)}.pdf`;
  return shareOrDownloadPdf({
    blob,
    fileName,
    title: options.labels.estimateTitle,
    text: options.project.name,
  });
}
