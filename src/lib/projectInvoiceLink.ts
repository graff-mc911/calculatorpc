export type LinkableInvoice = {
  id: string;
  document_no?: string | null;
  total_gross?: number | null;
  status?: string | null;
  client_id?: string | null;
  object_address?: string | null;
  notes?: string | null;
  project_id?: string | null;
  clients?: { name?: string | null } | null;
};

export type ProjectLinkContext = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  name?: string | null;
  address?: string | null;
  expense_budget?: number | null;
};

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zà-ÿа-яёіїєґ0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
}

/** Higher score = better match for attaching an invoice to a project. */
export function scoreInvoiceForProject(
  inv: LinkableInvoice,
  project: ProjectLinkContext
): number {
  let score = 0;
  const pClientId = project.client_id || '';
  const pClientName = String(project.client_name || '')
    .toLowerCase()
    .trim();
  const invClientName = String(inv.clients?.name || '')
    .toLowerCase()
    .trim();
  const place = `${project.address || ''} ${project.name || ''}`.toLowerCase();
  const invPlace = `${inv.object_address || ''} ${inv.notes || ''}`.toLowerCase();

  if (pClientId && inv.client_id && pClientId === inv.client_id) score += 50;

  if (pClientName && invClientName) {
    const short = pClientName.split(/[,/]/)[0].trim();
    if (
      short.length >= 3 &&
      (invClientName.includes(short) || short.includes(invClientName.split(/\s+/)[0] || ''))
    ) {
      score += 30;
    }
  }

  for (const token of tokens(place)) {
    if (invPlace.includes(token)) score += 20;
  }

  const budget = Number(project.expense_budget) || 0;
  const gross = Number(inv.total_gross) || 0;
  if (budget > 0 && gross > 0 && Math.abs(budget - gross) < 0.051) score += 40;

  if (!inv.project_id) score += 8;
  else if (inv.project_id === project.id) score += 100;
  else score -= 15;

  return score;
}

export function rankLinkableInvoices(
  invoices: LinkableInvoice[],
  project: ProjectLinkContext
): Array<LinkableInvoice & { score: number }> {
  return invoices
    .filter((inv) => inv.project_id !== project.id)
    .map((inv) => ({ ...inv, score: scoreInvoiceForProject(inv, project) }))
    .sort((a, b) => b.score - a.score || String(b.document_no || '').localeCompare(String(a.document_no || '')));
}
