import { supabase } from './supabase';
import type { ExpenseCategory } from './expenseCategories';

export type ProjectStatus = 'draft' | 'in_progress' | 'completed' | 'paid';

export const PROJECT_STATUSES: ProjectStatus[] = [
  'draft',
  'in_progress',
  'completed',
  'paid',
];

export type Project = {
  id: string;
  user_id: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
  address: string | null;
  currency: string;
  status: ProjectStatus;
  expense_budget: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectWorkItem = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  category: string;
  catalog_work_id: string | null;
  group_key: string;
  quantity: number;
  unit: string;
  unit_price: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectExpense = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  category: ExpenseCategory | string;
  amount: number;
  expense_date: string;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectPrepayment = {
  id: string;
  project_id: string;
  user_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  created_at: string;
};

export type ProjectBundle = {
  project: Project;
  workItems: ProjectWorkItem[];
  expenses: ProjectExpense[];
  prepayments: ProjectPrepayment[];
};

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

export class ProjectsSchemaMissingError extends Error {
  constructor() {
    super('PROJECTS_SCHEMA_MISSING');
    this.name = 'ProjectsSchemaMissingError';
  }
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('NOT_AUTHENTICATED');
  return uid;
}

export async function listProjects(): Promise<Project[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  return (data || []) as Project[];
}

export async function createProject(input: {
  name: string;
  client_id?: string | null;
  client_name?: string | null;
  address?: string | null;
  currency?: string;
  expense_budget?: number;
  notes?: string | null;
}): Promise<Project> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: uid,
      name: input.name.trim(),
      client_id: input.client_id || null,
      client_name: input.client_name?.trim() || null,
      address: input.address?.trim() || null,
      currency: input.currency || 'EUR',
      expense_budget: input.expense_budget ?? 0,
      notes: input.notes?.trim() || null,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  return data as Project;
}

export async function updateProject(
  id: string,
  patch: Partial<
    Pick<
      Project,
      | 'name'
      | 'client_id'
      | 'client_name'
      | 'address'
      | 'currency'
      | 'status'
      | 'expense_budget'
      | 'notes'
    >
  >
): Promise<Project> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', id)
    .eq('user_id', uid)
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  return data as Project;
}

export async function deleteProject(id: string): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', uid);
  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
}

/** Delete one or many projects owned by the current user. */
export async function deleteProjects(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  if (unique.length === 1) {
    await deleteProject(unique[0]);
    return;
  }
  const uid = await requireUserId();
  const { error } = await supabase
    .from('projects')
    .delete()
    .in('id', unique)
    .eq('user_id', uid);
  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
}

export async function fetchProjectBundle(projectId: string): Promise<ProjectBundle> {
  const uid = await requireUserId();

  const projectRes = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', uid)
    .single();

  if (projectRes.error) {
    if (isMissingRelation(projectRes.error)) throw new ProjectsSchemaMissingError();
    throw projectRes.error;
  }

  const [works, expenses, prepayments] = await Promise.all([
    supabase
      .from('project_work_items')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', uid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('project_expenses')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', uid)
      .order('expense_date', { ascending: false }),
    supabase
      .from('project_prepayments')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', uid)
      .order('paid_at', { ascending: false }),
  ]);

  for (const res of [works, expenses, prepayments]) {
    if (res.error) {
      if (isMissingRelation(res.error)) throw new ProjectsSchemaMissingError();
      throw res.error;
    }
  }

  return {
    project: projectRes.data as Project,
    workItems: (works.data || []) as ProjectWorkItem[],
    expenses: (expenses.data || []) as ProjectExpense[],
    prepayments: (prepayments.data || []) as ProjectPrepayment[],
  };
}

export async function addWorkItem(input: {
  project_id: string;
  title: string;
  category?: string;
  catalog_work_id?: string | null;
  group_key?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  sort_order?: number;
}): Promise<ProjectWorkItem> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('project_work_items')
    .insert({
      user_id: uid,
      project_id: input.project_id,
      title: input.title.trim(),
      category: input.category || 'other',
      catalog_work_id: input.catalog_work_id || null,
      group_key: input.group_key?.trim() || '',
      quantity: input.quantity ?? 1,
      unit: input.unit || 'm2',
      unit_price: input.unit_price ?? 0,
      sort_order: input.sort_order ?? 0,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  await touchProject(input.project_id);
  return data as ProjectWorkItem;
}

export async function updateWorkItem(
  id: string,
  patch: Partial<
    Pick<
      ProjectWorkItem,
      'title' | 'category' | 'group_key' | 'quantity' | 'unit' | 'unit_price' | 'sort_order'
    >
  >
): Promise<ProjectWorkItem> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('project_work_items')
    .update(patch)
    .eq('id', id)
    .eq('user_id', uid)
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  if (data?.project_id) await touchProject(data.project_id);
  return data as ProjectWorkItem;
}

export async function deleteWorkItem(id: string, projectId: string): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase
    .from('project_work_items')
    .delete()
    .eq('id', id)
    .eq('user_id', uid);
  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  await touchProject(projectId);
}

export async function addExpense(input: {
  project_id: string;
  title: string;
  category?: string;
  amount: number;
  expense_date?: string;
  receipt_url?: string | null;
  notes?: string | null;
}): Promise<ProjectExpense> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('project_expenses')
    .insert({
      user_id: uid,
      project_id: input.project_id,
      title: input.title.trim(),
      category: input.category || 'materials',
      amount: input.amount,
      expense_date: input.expense_date || new Date().toISOString().slice(0, 10),
      receipt_url: input.receipt_url || null,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  await touchProject(input.project_id);
  return data as ProjectExpense;
}

export async function updateExpense(
  id: string,
  patch: Partial<
    Pick<ProjectExpense, 'title' | 'category' | 'amount' | 'expense_date' | 'receipt_url' | 'notes'>
  >
): Promise<ProjectExpense> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('project_expenses')
    .update(patch)
    .eq('id', id)
    .eq('user_id', uid)
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  if (data?.project_id) await touchProject(data.project_id);
  return data as ProjectExpense;
}

export async function deleteExpense(id: string, projectId: string): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase
    .from('project_expenses')
    .delete()
    .eq('id', id)
    .eq('user_id', uid);
  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  await touchProject(projectId);
}

/** All project expenses for the signed-in user (newest first). */
export async function listProjectExpenses(): Promise<ProjectExpense[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('project_expenses')
    .select('*')
    .eq('user_id', uid)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  return (data || []) as ProjectExpense[];
}

export async function addPrepayment(input: {
  project_id: string;
  amount: number;
  paid_at?: string;
  note?: string | null;
}): Promise<ProjectPrepayment> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('project_prepayments')
    .insert({
      user_id: uid,
      project_id: input.project_id,
      amount: input.amount,
      paid_at: input.paid_at || new Date().toISOString().slice(0, 10),
      note: input.note?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  await touchProject(input.project_id);
  return data as ProjectPrepayment;
}

export async function deletePrepayment(id: string, projectId: string): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase
    .from('project_prepayments')
    .delete()
    .eq('id', id)
    .eq('user_id', uid);
  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  await touchProject(projectId);
}

/** All project prepayments / payments for the signed-in user (newest first). */
export async function listProjectPrepayments(): Promise<ProjectPrepayment[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('project_prepayments')
    .select('*')
    .eq('user_id', uid)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRelation(error)) throw new ProjectsSchemaMissingError();
    throw error;
  }
  return (data || []) as ProjectPrepayment[];
}

export async function uploadProjectReceipt(
  projectId: string,
  file: File | Blob,
  fileName?: string
): Promise<string> {
  const uid = await requireUserId();
  const safeName = (fileName || `receipt-${Date.now()}.jpg`).replace(/[^\w.\-]+/g, '_');
  const path = `${uid}/projects/${projectId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from('scanned-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;

  const { data } = supabase.storage.from('scanned-documents').getPublicUrl(path);
  return data.publicUrl;
}

async function touchProject(projectId: string): Promise<void> {
  const uid = await requireUserId();
  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', uid);
}
