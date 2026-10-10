import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, FileText, UserPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { supabase } from '../lib/supabase';
import { currencies, unitSelectOptions } from '../lib/languages';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { evalFieldExpression } from '../lib/calculator';
import { calculateLineTotal } from '../lib/invoiceTotals';
import { prefillInvoiceFromProject } from '../lib/invoiceFromProject';
import {
  consumeInvoiceImportDraft,
  type ImportedInvoiceDraft,
} from '../lib/invoiceImportFromFile';
import {
  fetchProjectBundle,
  listProjects,
  ProjectsSchemaMissingError,
  type Project,
} from '../lib/projectsApi';
import {
  formatInvoiceNumber,
  loadCpcSettings,
  type CpcCurrency,
} from '../lib/cpcSettings';

function asCpcCurrency(value: string | undefined, fallback: CpcCurrency): CpcCurrency {
  if (value === 'EUR' || value === 'UAH' || value === 'USD') return value;
  return fallback;
}

interface InvoiceItem {
  quantity: number;
  quantityDisplay: string;
  unit: string;
  price: number;
  priceDisplay: string;
  material: string;
  materialDisplay: string;
  description: string;
  total: number;
}

const emptyItem = (): InvoiceItem => ({
  quantity: 0,
  quantityDisplay: '',
  unit: 'm²',
  price: 0,
  priceDisplay: '',
  material: '',
  materialDisplay: '',
  description: '',
  total: 0,
});

function defaultDueDate(issueDate: string, termsDays?: number): string {
  const days =
    typeof termsDays === 'number' ? termsDays : loadCpcSettings().paymentTermsDays;
  const d = new Date(issueDate || new Date().toISOString().split('T')[0]);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  d.setDate(d.getDate() + Math.max(0, days));
  return d.toISOString().split('T')[0];
}

/** Columns the form may send that older prod DBs might not have yet. */
const OPTIONAL_INVOICE_COLUMNS = ['project_id', 'due_date'] as const;

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    msg.includes('schema cache') ||
    msg.includes('project_id') ||
    msg.includes('due_date') ||
    (msg.includes('column') && msg.includes('does not exist'))
  );
}

function missingColumnFromError(error: { message?: string } | null): string | null {
  const msg = error?.message || '';
  const match =
    msg.match(/Could not find the '([^']+)' column/i) ||
    msg.match(/column\s+[\w.]+\.([a-z_0-9]+)\s+does not exist/i) ||
    msg.match(/column\s+"?([a-z_0-9]+)"?\s+does not exist/i);
  return match?.[1] || null;
}

function stripOptionalColumns(
  payload: Record<string, unknown>,
  column?: string | null,
): Record<string, unknown> {
  const next = { ...payload };
  if (column && column in next) {
    delete next[column];
    return next;
  }
  for (const col of OPTIONAL_INVOICE_COLUMNS) {
    delete next[col];
  }
  return next;
}

export const InvoiceForm: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();
  const { showSuccess, showError } = useToastContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientEmail, setQuickClientEmail] = useState('');
  const [quickClientPhone, setQuickClientPhone] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsAvailable, setProjectsAvailable] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  const today = new Date().toISOString().split('T')[0];
  const appDefaults = loadCpcSettings();
  const [formData, setFormData] = useState({
    client_id: '',
    client_name: '',
    document_number: '',
    date: today,
    due_date: defaultDueDate(today, appDefaults.paymentTermsDays),
    work_period_start: today,
    work_period_end: today,
    currency: appDefaults.currency || 'EUR',
    status: 'draft',
    vat_enabled: appDefaults.defaultVatPercent > 0,
    vat_rate: appDefaults.defaultVatPercent > 0 ? appDefaults.defaultVatPercent : 20,
    document_type: 'invoice',
    invoice_language: language || 'en',
    project_id: '',
    project_area: '',
    object_address: '',
    notes: '',
  });

  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);

  useEffect(() => {
    void init();
  }, [id]);

  const init = async () => {
    try {
      setLoading(true);
      const loadedClients = await fetchClients();
      await fetchCompanyProfile();
      await fetchProjects();

      if (id) {
        await fetchInvoice(loadedClients);
      } else {
        await generateDocumentNumber();

        const preselectedClientId = searchParams.get('client_id');
        if (preselectedClientId && loadedClients?.length) {
          const match = loadedClients.find((c) => c.id === preselectedClientId);
          if (match) {
            setFormData((prev) => ({
              ...prev,
              client_id: match.id,
              client_name: match.name || '',
            }));
          }
        }

        const preselectedProjectId = searchParams.get('project_id');
        const fromProject = searchParams.get('from_project') === '1';
        if (preselectedProjectId) {
          setFormData((prev) => ({ ...prev, project_id: preselectedProjectId }));
          if (fromProject) {
            try {
              await applyProjectPrefill(preselectedProjectId);
            } catch (err) {
              console.warn('Project prefill failed', err);
            }
          }
        }

        if (searchParams.get('from_import') === '1') {
          const draft = consumeInvoiceImportDraft();
          if (draft) {
            applyImportDraft(draft, loadedClients || []);
          } else {
            showError(
              t('invoiceImportFailed') ||
                'Немає даних імпорту. Оберіть файл знову на сторінці рахунків.',
            );
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (!error && data) {
      setClients(data);
      return data;
    }

    return [];
  };

  const fetchProjects = async () => {
    try {
      const rows = await listProjects();
      setProjects(rows);
      setProjectsAvailable(true);
    } catch (error) {
      if (error instanceof ProjectsSchemaMissingError) {
        setProjects([]);
        setProjectsAvailable(false);
        return;
      }
      console.warn('Projects load failed', error);
      setProjects([]);
      setProjectsAvailable(false);
    }
  };

  /** Load client + works + qty + prices from a project (no retyping). */
  const applyProjectPrefill = async (projectId: string) => {
    if (!projectId) return;
    const bundle = await fetchProjectBundle(projectId);
    const filled = prefillInvoiceFromProject(bundle);
    setFormData((prev) => ({
      ...prev,
      project_id: filled.project_id,
      client_id: filled.client_id || prev.client_id,
      client_name: filled.client_name || prev.client_name,
      object_address: filled.object_address || prev.object_address,
      currency: asCpcCurrency(filled.currency, prev.currency),
      notes: filled.notes || prev.notes,
    }));
    if (filled.items.length > 0) {
      setItems(filled.items);
    }
  };

  const applyImportDraft = (
    draft: ImportedInvoiceDraft,
    clientList: Array<{ id: string; name?: string }>,
  ) => {
    const name = (draft.client_name || '').trim();
    const matched = name
      ? clientList.find(
          (c) => (c.name || '').trim().toLowerCase() === name.toLowerCase(),
        )
      : undefined;

    setFormData((prev) => ({
      ...prev,
      client_id: matched?.id || prev.client_id,
      client_name: matched?.name || name || prev.client_name,
      date: draft.date || prev.date,
      due_date: draft.date
        ? defaultDueDate(draft.date)
        : prev.due_date,
      work_period_start: draft.date || prev.work_period_start,
      work_period_end: draft.date || prev.work_period_end,
      document_number: draft.document_number || prev.document_number,
      currency: asCpcCurrency(draft.currency || 'EUR', 'EUR'),
      document_type: draft.document_type || 'invoice',
      invoice_language:
        draft.invoice_language || language || prev.invoice_language || 'en',
      object_address: draft.object_address || prev.object_address,
      notes: draft.notes || prev.notes,
    }));

    if (draft.items.length > 0) {
      setItems(
        draft.items.map((item) => ({
          quantity: item.quantity,
          quantityDisplay: item.quantityDisplay,
          unit: item.unit || 'pcs',
          price: item.price,
          priceDisplay: item.priceDisplay,
          material: item.material || '',
          materialDisplay: item.materialDisplay || '',
          description: item.description,
          total: item.total,
        })),
      );
    }

    const reviewCount = draft.items.filter((i) => i.needsReview).length;
    const warnParts = [
      draft.sourceFileName
        ? `${t('importInvoice') || 'Import'}: ${draft.sourceFileName} (${draft.items.length})`
        : `${t('importInvoice') || 'Import'}: ${draft.items.length}`,
    ];
    if (draft.importedSheet) warnParts.push(`аркуш «${draft.importedSheet}»`);
    if (draft.skippedSheets?.length) {
      warnParts.push(`пропущено: ${draft.skippedSheets.join(', ')}`);
    }
    if (reviewCount > 0) {
      warnParts.push(`${reviewCount} позицій потребують перевірки`);
    }
    if (draft.warnings?.length) {
      warnParts.push(draft.warnings.slice(0, 3).join(' · '));
    }
    setImportBanner(warnParts.join(' · '));
    showSuccess(
      t('invoiceImportReady') ||
        `Знайдено ${draft.items.length} позицій — перевірте і збережіть`,
    );
  };

  const fetchCompanyProfile = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from('company_profile')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error) {
      setCompanyProfile(data || null);
    }
  };

  const generateDocumentNumber = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from('invoices')
      .select('document_no')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNumber = 1;

    if (data?.document_no) {
      const match = data.document_no.match(/\d+$/);
      if (match) {
        nextNumber = parseInt(match[0], 10) + 1;
      }
    }

    const docNumber = formatInvoiceNumber(loadCpcSettings(), nextNumber);

    setFormData((prev) => ({
      ...prev,
      document_number: docNumber,
    }));
  };

  const fetchInvoice = async (loadedClients: any[] = []) => {
    const { data: invoiceData, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !invoiceData) {
      showError(t('errorLoadingInvoice') || 'Error loading invoice');
      return;
    }

    const linkedClient =
      loadedClients.find((c) => c.id === invoiceData.client_id) || null;
    const issueDate = invoiceData.date || today;

    setFormData({
      client_id: invoiceData.client_id || '',
      client_name: linkedClient?.name || invoiceData.client_name || '',
      document_number: invoiceData.document_no || '',
      date: issueDate,
      due_date: invoiceData.due_date || defaultDueDate(issueDate),
      work_period_start:
        invoiceData.work_period_start ||
        invoiceData.date ||
        today,
      work_period_end:
        invoiceData.work_period_end ||
        invoiceData.date ||
        today,
      currency: invoiceData.currency || 'EUR',
      status: invoiceData.status || 'draft',
      vat_enabled: (invoiceData.tax_percent || 0) > 0,
      vat_rate: invoiceData.tax_percent || 20,
      document_type: invoiceData.document_type || 'invoice',
      invoice_language: invoiceData.invoice_language || language || 'en',
      project_id: invoiceData.project_id || '',
      project_area: invoiceData.total_project_area?.toString() || '',
      object_address: invoiceData.object_address || '',
      notes: invoiceData.notes || '',
    });

    const { data: itemsData } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order');

    if (itemsData && itemsData.length > 0) {
      setItems(
        itemsData.map((item) => {
          const quantity = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const material = item.material || '';
          return {
            quantity,
            quantityDisplay: String(item.quantity ?? ''),
            unit: item.unit || 'm²',
            price,
            priceDisplay: String(item.price ?? ''),
            material,
            materialDisplay: material === '' || material == null ? '' : String(material),
            description: item.description || '',
            total: calculateLineTotal(quantity, price, material),
          };
        })
      );
    }
  };

  const handleQuickCreateClient = async () => {
    const name = quickClientName.trim();
    if (!name) {
      showError(t('clientNameRequired') || 'Client name is required');
      return;
    }

    try {
      setCreatingClient(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showError(t('notAuthenticated') || 'Not authenticated');
        return;
      }

      const { data, error } = await supabase
        .from('clients')
        .insert([
          {
            user_id: user.id,
            name,
            email: quickClientEmail.trim() || null,
            phone: quickClientPhone.trim() || null,
          },
        ])
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Failed to create client');

      setClients((prev) => [...prev, data].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      setFormData((prev) => ({
        ...prev,
        client_id: data.id,
        client_name: data.name || name,
      }));
      setShowQuickClient(false);
      setQuickClientName('');
      setQuickClientEmail('');
      setQuickClientPhone('');
      showSuccess(t('clientCreated') || 'Client created');
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
    } catch (error: any) {
      console.error('Quick create client error:', error);
      showError(error?.message || t('errorSavingClient') || 'Could not create client');
    } finally {
      setCreatingClient(false);
    }
  };

  const recomputeItem = (item: InvoiceItem): InvoiceItem => ({
    ...item,
    total: calculateLineTotal(item.quantity, item.price, item.material),
  });

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };

      if (field === 'quantity' || field === 'price' || field === 'material') {
        next[index] = recomputeItem(updated);
        return next;
      }

      next[index] = updated;
      return next;
    });
  };

  const applyExpressionField = (
    index: number,
    displayField: 'quantityDisplay' | 'priceDisplay' | 'materialDisplay',
    valueField: 'quantity' | 'price' | 'material',
    value: string,
    commit: boolean,
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[index], [displayField]: value };
      if (!commit) {
        next[index] = current;
        return next;
      }
      const evaluated = evalFieldExpression(value);
      if (evaluated == null) {
        if (valueField === 'material') {
          next[index] = recomputeItem({ ...current, material: value });
        } else if (valueField === 'quantity') {
          next[index] = recomputeItem({ ...current, quantity: 0, quantityDisplay: value });
        } else {
          next[index] = recomputeItem({ ...current, price: 0, priceDisplay: value });
        }
        return next;
      }
      if (valueField === 'material') {
        next[index] = recomputeItem({
          ...current,
          material: String(evaluated),
          materialDisplay: String(evaluated),
        });
      } else if (valueField === 'quantity') {
        next[index] = recomputeItem({
          ...current,
          quantity: evaluated,
          quantityDisplay: String(evaluated),
        });
      } else {
        next[index] = recomputeItem({
          ...current,
          price: evaluated,
          priceDisplay: String(evaluated),
        });
      }
      return next;
    });
  };

  const handleQuantityChange = (index: number, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      const evaluated = evalFieldExpression(value);
      const base = { ...next[index], quantityDisplay: value };
      next[index] = recomputeItem({
        ...base,
        quantity: evaluated != null ? evaluated : next[index].quantity,
      });
      return next;
    });
  };

  const handleQuantityBlur = (index: number) => {
    applyExpressionField(index, 'quantityDisplay', 'quantity', items[index].quantityDisplay, true);
  };

  const handlePriceChange = (index: number, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      const evaluated = evalFieldExpression(value);
      const base = { ...next[index], priceDisplay: value };
      next[index] = recomputeItem({
        ...base,
        price: evaluated != null ? evaluated : next[index].price,
      });
      return next;
    });
  };

  const handlePriceBlur = (index: number) => {
    applyExpressionField(index, 'priceDisplay', 'price', items[index].priceDisplay, true);
  };

  const handleMaterialChange = (index: number, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      const evaluated = evalFieldExpression(value);
      const base = { ...next[index], materialDisplay: value };
      next[index] = recomputeItem({
        ...base,
        material: evaluated != null ? String(evaluated) : value,
      });
      return next;
    });
  };

  const handleMaterialBlur = (index: number) => {
    applyExpressionField(index, 'materialDisplay', 'material', items[index].materialDisplay, true);
  };

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const netTotal = useMemo(() => items.reduce((sum, item) => sum + item.total, 0), [items]);

  const vatAmount = useMemo(
    () => (formData.vat_enabled ? (netTotal * formData.vat_rate) / 100 : 0),
    [formData.vat_enabled, formData.vat_rate, netTotal]
  );

  const grossTotal = useMemo(() => netTotal + vatAmount, [netTotal, vatAmount]);

  const formatCurrency = (amount: number) => amount.toFixed(2);

  const bankDetailsText = useMemo(() => {
    if (!companyProfile) return '';
    const parts = [
      companyProfile.bank_name && `${t('bank') || 'Bank:'} ${companyProfile.bank_name}`,
      companyProfile.iban && `IBAN: ${companyProfile.iban}`,
      companyProfile.bic && `${t('bicSwift') || 'BIC/SWIFT:'} ${companyProfile.bic}`,
    ].filter(Boolean);
    return parts.join('\n');
  }, [companyProfile, t]);

  const validateForPdf = (): string | null => {
    if (!formData.client_id && !formData.client_name.trim()) {
      return t('clientRequired') || 'Select or create a client';
    }
    if (!formData.document_number.trim()) {
      return t('documentNumberRequired') || 'Invoice number is required';
    }
    if (!formData.date) {
      return t('issueDateRequired') || 'Issue date is required';
    }
    const hasLine = items.some(
      (item) => item.description.trim() || item.quantity > 0 || item.price > 0
    );
    if (!hasLine) {
      return t('lineItemsRequired') || 'Add at least one line item';
    }
    return null;
  };

  const persistInvoice = async (status: string): Promise<string> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error(t('notAuthenticated') || 'Not authenticated');
    }

    const selectedClient = clients.find((c) => c.id === formData.client_id);
    const clientName =
      formData.client_name.trim() || selectedClient?.name || '';

    const selectedProject = projects.find((p) => p.id === formData.project_id);
    const totalProjectArea = formData.project_area ? parseFloat(formData.project_area) : 0;
    const totalAreaNet = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAreaGross = totalAreaNet;

    const invoicePayload: Record<string, unknown> = {
      user_id: user.id,
      client_id: formData.client_id || null,
      client_name: clientName,
      client_number: selectedClient?.client_number || null,
      document_no: formData.document_number,
      date: formData.date,
      due_date: formData.due_date || null,
      work_period_start: formData.work_period_start,
      work_period_end: formData.work_period_end,
      currency: formData.currency,
      status,
      document_type: formData.document_type,
      invoice_language: language || formData.invoice_language || 'en',
      project_id: formData.project_id || null,
      object_address:
        formData.object_address ||
        selectedProject?.address ||
        null,
      notes: formData.notes || null,

      total_net: netTotal,
      tax_percent: formData.vat_enabled ? formData.vat_rate : 0,
      tax_amount: vatAmount,
      total_gross: grossTotal,
      total_project_area: totalProjectArea || null,
      total_area_net: totalAreaNet || null,
      total_area_gross: totalAreaGross || null,

      executor_name: companyProfile?.company_name || null,
      executor_logo_url: companyProfile?.logo_url || null,
      executor_address: companyProfile?.address || null,
      executor_phone: companyProfile?.phone || null,
      executor_email: companyProfile?.email || null,
      executor_bank: companyProfile?.bank_name || null,
      executor_iban: companyProfile?.iban || null,
      executor_bic: companyProfile?.bic || null,
      executor_tax_number: companyProfile?.tax_number || null,
      // Seed company signature/stamp only on create (do not overwrite later signs)
      ...(!id && companyProfile?.signature_url
        ? { signature_data_url: companyProfile.signature_url }
        : {}),
    };

    let invoiceId = id;
    let workingPayload = invoicePayload;

    const runUpdate = async (payload: Record<string, unknown>) =>
      supabase.from('invoices').update(payload).eq('id', id);

    const runInsert = async (payload: Record<string, unknown>) =>
      supabase.from('invoices').insert([payload]).select().maybeSingle();

    if (id) {
      let { error } = await runUpdate(workingPayload);
      for (let attempt = 0; error && isMissingColumnError(error) && attempt < 4; attempt++) {
        workingPayload = stripOptionalColumns(
          workingPayload,
          missingColumnFromError(error),
        );
        ({ error } = await runUpdate(workingPayload));
      }
      if (error) throw error;
    } else {
      let { data, error } = await runInsert(workingPayload);
      for (let attempt = 0; error && isMissingColumnError(error) && attempt < 4; attempt++) {
        workingPayload = stripOptionalColumns(
          workingPayload,
          missingColumnFromError(error),
        );
        ({ data, error } = await runInsert(workingPayload));
      }
      if (error) throw error;
      invoiceId = data?.id;
    }

    if (!invoiceId) {
      throw new Error('Failed to get invoice ID');
    }

    await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);

    if (items.length > 0) {
      const itemsPayload = items.map((item, index) => ({
        invoice_id: invoiceId,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        material: item.material,
        description: item.description || '',
        total: calculateLineTotal(item.quantity, item.price, item.material),
        sort_order: index,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;
    }

    await queryClient.invalidateQueries({ queryKey: ['invoices'] });
    return invoiceId;
  };

  const handleSaveDraft = async () => {
    try {
      setSaving(true);
      const invoiceId = await persistInvoice('draft');
      setFormData((prev) => ({ ...prev, status: 'draft' }));
      showSuccess(t('draftSaved') || 'Draft saved');
      if (!id) {
        navigate(`/invoices/${invoiceId}/edit`, { replace: true });
      }
    } catch (error: any) {
      console.error('Error saving draft:', error);
      showError(error?.message || t('errorSavingInvoice') || 'Error saving invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndGeneratePdf = async () => {
    const validationError = validateForPdf();
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      setSaving(true);
      const nextStatus = formData.status === 'draft' ? 'draft' : formData.status || 'draft';
      const invoiceId = await persistInvoice(nextStatus);
      showSuccess(
        id
          ? (t('invoiceUpdated') || 'Invoice updated')
          : (t('invoiceCreated') || 'Invoice created')
      );
      navigate(`/invoices/${invoiceId}/preview`);
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      showError(error?.message || t('errorSavingInvoice') || 'Error saving invoice');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-2 pb-8 px-3 sm:px-4 md:px-6 max-w-5xl mx-auto w-full min-w-0">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-2 pb-8 px-3 sm:px-4 md:px-6 max-w-5xl mx-auto w-full min-w-0">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="flex items-center justify-center p-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl mb-4 transition-all active:scale-95"
          title={t('back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-1">
              {id ? t('editInvoice') : t('newInvoice')}
            </h2>
            <p className="text-white/60 text-sm">
              {id ? t('updateInvoiceInfo') : t('createNewInvoice')}
            </p>
          </div>
        </div>
        {importBanner && (
          <div
            className="mt-3 px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'rgba(196, 140, 90, 0.15)',
              border: '1px solid var(--cpc-copper)',
              color: 'var(--cpc-copper)',
            }}
          >
            {importBanner}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* 1) Client */}
        <section className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <h3 className="text-white font-medium text-lg mb-4">{t('client')}</h3>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="flex-1">
              <Select
                label={t('chooseClient')}
                value={formData.client_id}
                onChange={(e) => {
                  const client = clients.find((c) => c.id === e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    client_id: e.target.value,
                    client_name: client?.name || '',
                  }));
                }}
                options={[
                  { value: '', label: t('chooseClient') },
                  ...clients.map((c) => ({
                    value: c.id,
                    label: c.client_number ? `${c.name} (${c.client_number})` : c.name,
                  })),
                ]}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setQuickClientName('');
                setShowQuickClient(true);
              }}
              className="shrink-0 border border-white/10 text-orange-400 hover:bg-white/10"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {t('quickCreateClient') || 'New client'}
            </Button>
          </div>
        </section>

        {/* 2) General */}
        <section className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <h3 className="text-white font-medium text-lg mb-4">
            {t('invoiceGeneral') || 'General'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={t('documentNumber') || t('invoiceNumber') || 'Invoice number'}
              value={formData.document_number}
              onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
            />

            <Input
              label={t('issueDate') || t('date') || 'Issue date'}
              type="date"
              value={formData.date}
              onChange={(e) => {
                const date = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  date,
                  due_date:
                    !prev.due_date || prev.due_date === defaultDueDate(prev.date)
                      ? defaultDueDate(date)
                      : prev.due_date,
                  work_period_start: prev.work_period_start || date,
                  work_period_end: prev.work_period_end || date,
                }));
              }}
            />

            <Input
              label={t('dueDate') || 'Due date'}
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />

            {projectsAvailable ? (
              <Select
                label={t('selectProject') || t('projects') || 'Об’єкт'}
                value={formData.project_id}
                onChange={(e) => {
                  const projectId = e.target.value;
                  setFormData((prev) => ({ ...prev, project_id: projectId }));
                  if (projectId) {
                    void applyProjectPrefill(projectId).catch((err) => {
                      console.warn('Project prefill failed', err);
                      showError(t('error') || 'Не вдалося завантажити об’єкт');
                    });
                  }
                }}
                options={[
                  { value: '', label: t('noProject') || 'Без об’єкта' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            ) : null}

            <Select
              label={t('currency')}
              options={currencies.map((c) => ({
                value: c.code,
                label: `${c.code} (${c.symbol})`,
              }))}
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            />

            <Select
              label={t('documentType')}
              options={[
                { value: 'invoice', label: t('invoiceDocType') },
                { value: 'proposal', label: t('proposalType') },
                { value: 'estimate', label: t('estimateType') },
              ]}
              value={formData.document_type}
              onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
            />
          </div>
        </section>

        {/* 3) Line items */}
        <section className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h3 className="font-medium text-white text-lg">{t('positions')}</h3>
              <p className="text-white/40 text-xs mt-1">{t('calcOnSiteHint')}</p>
            </div>

            <Button type="button" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" />
              <span className="ml-1">{t('addLine') || t('addPosition')}</span>
            </Button>
          </div>

          <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_5rem_6rem_7rem_7rem_2.5rem] gap-2 px-1 mb-2 text-xs text-white/50">
            <span>{t('lineTitle') || t('description') || 'Title'}</span>
            <span>{t('qty')}</span>
            <span>{t('unitShort')}</span>
            <span>{t('unitPrice') || t('priceLabel')}</span>
            <span>{t('lineTotal') || t('sumLabel')}</span>
            <span />
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-3 md:p-4">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_5rem_6rem_7rem_7rem_2.5rem] gap-2 items-end">
                  <div>
                    <label className="md:hidden block mb-1.5 text-sm font-medium text-white/70">
                      {t('lineTitle') || t('description')}
                    </label>
                    <Input
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      placeholder={t('lineTitle') || t('description')}
                    />
                  </div>

                  <div>
                    <label className="md:hidden block mb-1.5 text-sm font-medium text-white/70">
                      {t('qty')}
                    </label>
                    <Input
                      type="text"
                      value={item.quantityDisplay}
                      onChange={(e) => handleQuantityChange(index, e.target.value)}
                      onBlur={() => handleQuantityBlur(index)}
                      placeholder={t('calculatorPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="md:hidden block mb-1.5 text-sm font-medium text-white/70">
                      {t('unitShort')}
                    </label>
                    <Select
                      options={unitSelectOptions(t)}
                      value={item.unit}
                      onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="md:hidden block mb-1.5 text-sm font-medium text-white/70">
                      {t('unitPrice') || t('price')}
                    </label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.priceDisplay}
                      onChange={(e) => handlePriceChange(index, e.target.value)}
                      onBlur={() => handlePriceBlur(index)}
                      placeholder={t('calculatorPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="md:hidden block mb-1.5 text-sm font-medium text-white/70">
                      {t('lineTotal') || t('totalAmount')}
                    </label>
                    <Input value={item.total ? formatCurrency(item.total) : ''} disabled />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                      className="disabled:opacity-30"
                      title={t('delete') || 'Delete'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 max-w-xs">
                  <Input
                    label={t('material')}
                    type="text"
                    inputMode="decimal"
                    value={item.materialDisplay}
                    onChange={(e) => handleMaterialChange(index, e.target.value)}
                    onBlur={() => handleMaterialBlur(index)}
                    placeholder={t('calculatorPlaceholder') || '0.00'}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4) Summary */}
        <section className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
          <h3 className="text-white font-medium text-lg mb-4">
            {t('invoiceSummary') || 'Summary'}
          </h3>

          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.vat_enabled}
                  onChange={(e) => setFormData({ ...formData, vat_enabled: e.target.checked })}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-white">
                  {t('enableVat')} ({formData.vat_rate}%)
                </span>
              </label>

              {formData.vat_enabled && (
                <div className="flex items-center gap-2">
                  <span className="text-white/60 text-sm">{t('vatPercent')}</span>
                  <Input
                    type="number"
                    value={formData.vat_rate}
                    onChange={(e) =>
                      setFormData({ ...formData, vat_rate: Number(e.target.value) })
                    }
                    className="w-20"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-white/60">{t('netAmount')}</span>
                <span className="font-medium text-white">
                  {formatCurrency(netTotal)} {formData.currency}
                </span>
              </div>

              {formData.vat_enabled && (
                <div className="flex justify-between items-center">
                  <span className="text-white/60">
                    {t('vat')} ({formData.vat_rate}%)
                  </span>
                  <span className="font-medium text-white">
                    {formatCurrency(vatAmount)} {formData.currency}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <span className="font-semibold text-white text-lg">
                  {t('grandTotal') || t('grossAmount')}
                </span>
                <span className="text-2xl font-bold text-orange-400">
                  {formatCurrency(grossTotal)} {formData.currency}
                </span>
              </div>
            </div>

            {bankDetailsText ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-white/50 text-xs mb-1">{t('bankDetails')}</p>
                <pre className="text-white/80 text-sm whitespace-pre-wrap font-sans">
                  {bankDetailsText}
                </pre>
              </div>
            ) : null}

            <Textarea
              label={t('notes') || t('bankDetails')}
              placeholder={t('notesOrBankDetails') || t('additionalNotes')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
            />
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-gray-300 hover:text-white transition-all active:scale-95 sm:w-auto"
            title={t('back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <Button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={saving}
            className="flex-1 bg-white/10 border border-white/10 text-white hover:bg-white/20"
          >
            <Save className="h-4 w-4 mr-2" />
            {t('saveDraft') || 'Save draft'}
          </Button>

          <Button
            type="button"
            onClick={() => void handleSaveAndGeneratePdf()}
            disabled={saving}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <FileText className="h-4 w-4 mr-2" />
            {t('saveAndGeneratePdf') || 'Save and generate PDF'}
          </Button>
        </div>
      </div>

      {showQuickClient && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-semibold text-white">
              {t('quickCreateClient') || 'New client'}
            </h3>
            <Input
              label={t('name') || 'Name'}
              value={quickClientName}
              onChange={(e) => setQuickClientName(e.target.value)}
              autoFocus
            />
            <Input
              label={t('email') || 'Email'}
              type="email"
              value={quickClientEmail}
              onChange={(e) => setQuickClientEmail(e.target.value)}
            />
            <Input
              label={t('phone') || 'Phone'}
              value={quickClientPhone}
              onChange={(e) => setQuickClientPhone(e.target.value)}
            />
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 border border-white/10"
                onClick={() => setShowQuickClient(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={creatingClient || !quickClientName.trim()}
                onClick={() => void handleQuickCreateClient()}
              >
                {creatingClient ? (t('saving') || 'Saving…') : (t('save') || 'Save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
