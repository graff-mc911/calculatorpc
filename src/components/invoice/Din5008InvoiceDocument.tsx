import React from 'react';
import { currencies, translations, translateUnit } from '../../lib/languages';
import { useLanguage } from '../../contexts/LanguageContext';
import { expandItemsForInvoiceTable } from '../../lib/invoiceTotals';

interface InvoiceItem {
  description: string;
  material?: string | number;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  /** Category / section header row inside the items table */
  is_section?: boolean;
}

interface InvoiceData {
  document_number: string;
  date: string;
  work_period_start?: string;
  work_period_end?: string;
  due_date?: string;
  client_name: string;
  client_number?: string;
  client_address?: string;
  client_tax_number?: string;
  currency: string;
  items: InvoiceItem[];
  vat_enabled: boolean;
  vat_rate: number;
  notes?: string;
  object_address?: string;
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_tax_number?: string;
  company_bank?: string;
  company_iban?: string;
  company_bic?: string;
  company_logo_url?: string;
  signature_data_url?: string;
  signed_by?: string;
  signed_at?: string;
  /** Document language for labels - independent of UI language */
  invoice_language?: string;
}

interface InvoiceDocumentProps {
  data: InvoiceData;
  headerRef?: React.RefObject<HTMLDivElement>;
  clientRef?: React.RefObject<HTMLDivElement>;
  itemsRef?: React.RefObject<HTMLDivElement>;
  totalRef?: React.RefObject<HTMLDivElement>;
}

function formatDeDate(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('de-DE');
}

function senderReturnLine(name?: string, address?: string): string {
  const parts = [name, ...(address || '').split('\n').map((l) => l.trim()).filter(Boolean)];
  return parts.filter(Boolean).join(', ');
}

function withCurrencySymbol(label: string, symbol: string): string {
  return label.replace(/\u20AC|€|€/g, symbol);
}

/**
 * DIN 5008 / German construction invoice layout (preview + print HTML).
 * All labels via translations - no hardcoded UI strings.
 * Material field expands to its own Lexware-style Pauschal row.
 */
export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({
  data,
  headerRef,
  clientRef,
  itemsRef,
  totalRef,
}) => {
  const { language } = useLanguage();
  const logoUrl = data.company_logo_url;
  // Labels follow the language selected in the app language list
  const labelLang = language || data.invoice_language || 'en';

  const tInvoice = (key: string) => {
    const langTranslations = translations[labelLang as keyof typeof translations];
    if (langTranslations && key in langTranslations) {
      return langTranslations[key as keyof typeof langTranslations] as string;
    }
    return (translations.en[key as keyof typeof translations.en] as string) || key;
  };

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const currencySymbol = currencies.find((c) => c.code === data.currency)?.symbol || '\u20AC';

  const tableRows = expandItemsForInvoiceTable(data.items || [], {
    materialLabel: tInvoice('material'),
    pauschalUnit: tInvoice('unitPauschal'),
  }).map((row) =>
    row.is_section
      ? row
      : {
          ...row,
          unit: translateUnit(row.unit, tInvoice),
        }
  );

  const netTotal = tableRows.reduce((sum, item) => (item.is_section ? sum : sum + item.total), 0);
  const vatAmount = data.vat_enabled ? (netTotal * data.vat_rate) / 100 : 0;
  const grossTotal = netTotal + vatAmount;
  const showReverseCharge = !data.vat_enabled;

  const periodStart = data.work_period_start || data.date;
  const periodEnd = data.work_period_end || data.work_period_start || data.date;
  const periodText =
    periodStart && periodEnd && periodStart !== periodEnd
      ? `${formatDeDate(periodStart)} ${tInvoice('servicePeriodTo')} ${formatDeDate(periodEnd)}`
      : formatDeDate(periodStart || data.date);

  const returnLine = senderReturnLine(data.company_name, data.company_address);
  let posCounter = 0;

  const cellBorder = '0.5pt solid #000';
  const metaLabelStyle: React.CSSProperties = {
    padding: '1mm 3mm 1mm 0',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    verticalAlign: 'top',
  };
  const metaValueStyle: React.CSSProperties = {
    padding: '1mm 0',
    textAlign: 'right',
    verticalAlign: 'top',
    fontWeight: 500,
  };

  return (
    <div
      id="invoice-document"
      className="bg-white w-full mx-auto"
      style={{
        width: '210mm',
        minHeight: '297mm',
        height: 'auto',
        fontFamily: '"DejaVu Sans", "Noto Sans", Arial, Helvetica, sans-serif',
        fontSize: '10pt',
        lineHeight: '1.35',
        color: '#000',
        padding: '15mm 18mm 12mm 20mm',
        position: 'relative',
        WebkitFontSmoothing: 'antialiased',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* A. Company header (sample RE0009: left block only) */}
      <div ref={headerRef} style={{ marginBottom: '6mm' }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            style={{ height: '22mm', width: 'auto', maxWidth: '70mm', objectFit: 'contain' }}
            crossOrigin="anonymous"
          />
        ) : (
          <div style={{ fontSize: '14pt', fontWeight: 700, letterSpacing: '0.3pt' }}>
            {data.company_name || '—'}
          </div>
        )}
        <div style={{ marginTop: logoUrl ? '2mm' : '1mm', fontSize: '9pt', lineHeight: 1.45 }}>
          {data.company_name && logoUrl && (
            <div style={{ fontWeight: 700 }}>{data.company_name}</div>
          )}
          {data.company_address && (
            <div style={{ whiteSpace: 'pre-line' }}>{data.company_address}</div>
          )}
          {data.company_phone && (
            <div>
              {tInvoice('phoneLabel')}: {data.company_phone}
            </div>
          )}
          {data.company_email && <div>{data.company_email}</div>}
        </div>
      </div>

      {/* B. Return line + recipient (left) · invoice meta (right) — matches RE0009 */}
      <div
        ref={clientRef}
        style={{
          marginBottom: '7mm',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8mm',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: '95mm' }}>
          {returnLine && (
            <div
              style={{
                fontSize: '6.5pt',
                textDecoration: 'underline',
                marginBottom: '2.5mm',
                lineHeight: 1.3,
              }}
            >
              {returnLine}
            </div>
          )}
          <div style={{ fontSize: '10pt', lineHeight: 1.45 }}>
            {data.client_name && <div style={{ fontWeight: 700 }}>{data.client_name}</div>}
            {data.client_address && (
              <div style={{ whiteSpace: 'pre-line' }}>{data.client_address}</div>
            )}
          </div>
        </div>

        <div style={{ flex: '0 0 auto', minWidth: '62mm' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '9pt' }}>
            <tbody>
              <tr>
                <td style={metaLabelStyle}>{tInvoice('invoiceNumber')}:</td>
                <td style={metaValueStyle}>{data.document_number}</td>
              </tr>
              <tr>
                <td style={metaLabelStyle}>{tInvoice('customerNumber')}:</td>
                <td style={metaValueStyle}>{data.client_number || '—'}</td>
              </tr>
              <tr>
                <td style={metaLabelStyle}>{tInvoice('date')}:</td>
                <td style={metaValueStyle}>{formatDeDate(data.date)}</td>
              </tr>
              <tr>
                <td style={{ ...metaLabelStyle, verticalAlign: 'top' }}>
                  {tInvoice('performancePeriod')}:
                </td>
                <td style={metaValueStyle}>{periodText}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* C. Title + BVH + intro */}
      <h1 style={{ fontSize: '14pt', fontWeight: 700, margin: '0 0 3mm 0' }}>
        {tInvoice('invoiceTitle')} {data.document_number}
      </h1>

      {data.object_address && (
        <div style={{ fontSize: '10pt', fontWeight: 700, marginBottom: '4mm' }}>
          {tInvoice('projectRefBvh')}: {data.object_address}
        </div>
      )}

      <div style={{ fontSize: '10pt', lineHeight: 1.5, marginBottom: '5mm' }}>
        <p style={{ margin: '0 0 2.5mm 0' }}>{tInvoice('dearSalutation')},</p>
        <p style={{ margin: '0 0 2.5mm 0' }}>{tInvoice('thankYouText')}</p>
        <p style={{ margin: 0 }}>{tInvoice('qualityText')}</p>
      </div>

      {/* D. Items table */}
      <div ref={itemsRef} style={{ marginBottom: '5mm' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9pt',
            border: cellBorder,
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '1.8mm', width: '10mm', border: cellBorder, fontWeight: 700 }}>
                {tInvoice('position')}
              </th>
              <th style={{ textAlign: 'left', padding: '1.8mm', border: cellBorder, fontWeight: 700 }}>
                {tInvoice('designation')}
              </th>
              <th style={{ textAlign: 'right', padding: '1.8mm', width: '16mm', border: cellBorder, fontWeight: 700 }}>
                {tInvoice('amountShort')}
              </th>
              <th style={{ textAlign: 'center', padding: '1.8mm', width: '18mm', border: cellBorder, fontWeight: 700 }}>
                {tInvoice('unit')}
              </th>
              <th style={{ textAlign: 'right', padding: '1.8mm', width: '24mm', border: cellBorder, fontWeight: 700 }}>
                {withCurrencySymbol(tInvoice('unitPriceShort'), currencySymbol)}
              </th>
              <th style={{ textAlign: 'right', padding: '1.8mm', width: '24mm', border: cellBorder, fontWeight: 700 }}>
                {withCurrencySymbol(tInvoice('totalPriceShort'), currencySymbol)}
              </th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((item, index) => {
              if (item.is_section) {
                return (
                  <tr key={index}>
                    <td
                      colSpan={6}
                      style={{
                        padding: '2mm',
                        border: cellBorder,
                        fontWeight: 700,
                        background: '#f5f5f5',
                      }}
                    >
                      {item.description}
                    </td>
                  </tr>
                );
              }
              posCounter += 1;
              return (
                <tr key={index}>
                  <td style={{ padding: '1.8mm', border: cellBorder }}>{posCounter}</td>
                  <td style={{ padding: '1.8mm', border: cellBorder, fontWeight: 600 }}>
                    {item.description}
                  </td>
                  <td style={{ padding: '1.8mm', textAlign: 'right', border: cellBorder }}>
                    {Number(item.quantity).toLocaleString('de-DE')}
                  </td>
                  <td style={{ padding: '1.8mm', textAlign: 'center', border: cellBorder }}>{item.unit}</td>
                  <td style={{ padding: '1.8mm', textAlign: 'right', border: cellBorder }}>
                    {formatCurrency(item.price)}
                  </td>
                  <td style={{ padding: '1.8mm', textAlign: 'right', border: cellBorder }}>
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              );
            })}

            {data.vat_enabled && (
              <>
                <tr>
                  <td colSpan={5} style={{ padding: '1.8mm', border: cellBorder, fontWeight: 700 }}>
                    {tInvoice('netAmount')}
                  </td>
                  <td style={{ padding: '1.8mm', textAlign: 'right', border: cellBorder }}>
                    {formatCurrency(netTotal)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ padding: '1.8mm', border: cellBorder }}>
                    {tInvoice('vat')} {data.vat_rate} %
                  </td>
                  <td style={{ padding: '1.8mm', textAlign: 'right', border: cellBorder }}>
                    {formatCurrency(vatAmount)}
                  </td>
                </tr>
              </>
            )}

            <tr>
              <td colSpan={5} style={{ padding: '2mm', border: cellBorder, fontWeight: 700 }}>
                {showReverseCharge ? tInvoice('totalAmountStar') : tInvoice('grossAmount')}
              </td>
              <td
                ref={totalRef as unknown as React.RefObject<HTMLTableCellElement>}
                style={{ padding: '2mm', textAlign: 'right', border: cellBorder, fontWeight: 700 }}
              >
                {formatCurrency(grossTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* E. Closing block — same order as sample Rechnung RE0009 */}
      <div style={{ fontSize: '10pt', lineHeight: 1.5, marginBottom: '6mm' }}>
        {showReverseCharge && (
          <p style={{ margin: '0 0 3mm 0' }}>{tInvoice('reverseChargeNote')}</p>
        )}
        {data.notes?.trim() ? (
          <p style={{ margin: '0 0 3mm 0', whiteSpace: 'pre-line' }}>{data.notes.trim()}</p>
        ) : null}
        <p style={{ margin: '0 0 3mm 0' }}>{tInvoice('paymentDue')}</p>
        <p style={{ margin: '0 0 3mm 0' }}>{tInvoice('closingText')}</p>
        <p style={{ margin: '0 0 2mm 0' }}>{tInvoice('withRegards')}</p>
        {data.signed_by && (
          <div style={{ marginTop: '2mm', fontWeight: 600 }}>{data.signed_by}</div>
        )}
        {data.signature_data_url && (
          <img
            src={data.signature_data_url}
            alt=""
            style={{ marginTop: '3mm', maxHeight: '18mm', maxWidth: '50mm' }}
            crossOrigin="anonymous"
          />
        )}
        <p style={{ margin: '5mm 0 0 0', fontSize: '8.5pt', lineHeight: 1.4 }}>
          {tInvoice('legalNotice')}
        </p>
      </div>

      {/* F. 3-column footer */}
      <div
        style={{
          borderTop: '0.5pt solid #000',
          paddingTop: '2.5mm',
          fontSize: '7pt',
          lineHeight: 1.45,
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '4mm',
        }}
      >
        <div style={{ flex: 1 }}>
          {data.company_name && <div style={{ fontWeight: 700 }}>{data.company_name}</div>}
          {data.company_address && <div style={{ whiteSpace: 'pre-line' }}>{data.company_address}</div>}
          {data.company_phone && (
            <div>
              {tInvoice('phoneLabel')}: {data.company_phone}
            </div>
          )}
          {data.company_email && <div>{data.company_email}</div>}
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          {data.company_tax_number && (
            <div>
              {tInvoice('taxNumber')}: {data.company_tax_number}
              {data.signed_by ? ` ${data.signed_by}` : ''}
            </div>
          )}
          <div style={{ marginTop: '1.5mm' }}>
            {tInvoice('pageLabel')} 1/1
          </div>
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          {data.company_bank && <div>{data.company_bank}</div>}
          {data.company_iban && (
            <div>
              {tInvoice('ibanLabel')}: {data.company_iban}
            </div>
          )}
          {data.company_bic && (
            <div>
              {tInvoice('bicLabel')}: {data.company_bic}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
