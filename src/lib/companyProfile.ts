/**
 * Helpers for company_profile → invoice/PDF company fields.
 */

export type CompanyProfileRow = {
  company_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_number?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  bic?: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
  signature_url?: string | null;
  signature_path?: string | null;
  google_client_ids?: string | null;
  // Already-normalized aliases (project PDF / demos)
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_tax_number?: string | null;
  company_bank?: string | null;
  company_iban?: string | null;
  company_bic?: string | null;
};

export type PdfCompanyFields = {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_tax_number: string;
  company_bank: string;
  company_iban: string;
  company_bic: string;
  logo_url: string;
  signature_url: string;
};

/** Map a company_profile row (or mixed aliases) into PDF/invoice company shape. */
export function toPdfCompany(profile?: CompanyProfileRow | null): PdfCompanyFields {
  const p = profile || {};
  return {
    company_name: p.company_name || '',
    company_address: p.company_address || p.address || '',
    company_phone: p.company_phone || p.phone || '',
    company_email: p.company_email || p.email || '',
    company_tax_number: p.company_tax_number || p.tax_number || '',
    company_bank: p.company_bank || p.bank_name || '',
    company_iban: p.company_iban || p.iban || '',
    company_bic: p.company_bic || p.bic || '',
    logo_url: p.logo_url || '',
    signature_url: p.signature_url || '',
  };
}

/** Merge invoice executor_* with live company_profile for PDF header/footer. */
export function buildCompanyFromInvoice(
  invoice: Record<string, any> | null | undefined,
  companyProfile?: CompanyProfileRow | null,
) {
  const fromProfile = toPdfCompany(companyProfile);
  return {
    company_name: invoice?.executor_name || fromProfile.company_name,
    company_address: invoice?.executor_address || fromProfile.company_address,
    company_phone: invoice?.executor_phone || fromProfile.company_phone,
    company_email: invoice?.executor_email || fromProfile.company_email,
    company_tax_number: invoice?.executor_tax_number || fromProfile.company_tax_number,
    company_bank: invoice?.executor_bank || fromProfile.company_bank,
    company_iban: invoice?.executor_iban || fromProfile.company_iban,
    company_bic: invoice?.executor_bic || fromProfile.company_bic,
  };
}

export function resolveCompanyLogoUrl(
  invoice?: Record<string, any> | null,
  companyProfile?: CompanyProfileRow | null,
): string {
  return invoice?.executor_logo_url || companyProfile?.logo_url || '';
}

export function resolveCompanySignatureUrl(
  invoice?: Record<string, any> | null,
  companyProfile?: CompanyProfileRow | null,
): string {
  return invoice?.signature_data_url || companyProfile?.signature_url || '';
}
