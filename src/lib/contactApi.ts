import { supabase } from './supabase';

export type ContactCategory = 'question' | 'complaint' | 'suggestion' | 'other';
export type ContactStatus = 'open' | 'answered' | 'closed';

export type ContactThread = {
  id: string;
  user_id: string;
  user_email: string | null;
  category: ContactCategory;
  subject: string | null;
  status: ContactStatus;
  country_code: string | null;
  last_message_at: string;
  created_at: string;
};

export type ContactMessage = {
  id: string;
  thread_id: string;
  author_id: string;
  author_role: 'user' | 'owner';
  body: string;
  created_at: string;
};

const THREAD_SELECT =
  'id, user_id, user_email, category, subject, status, country_code, last_message_at, created_at';

export async function fetchMyContactThreads(): Promise<ContactThread[]> {
  const { data, error } = await supabase
    .from('contact_threads')
    .select(THREAD_SELECT)
    .order('last_message_at', { ascending: false });

  if (error) throw error;
  return (data as ContactThread[]) ?? [];
}

export async function fetchOwnerContactThreads(opts?: {
  status?: ContactStatus | 'all';
  search?: string;
}): Promise<ContactThread[]> {
  let q = supabase
    .from('contact_threads')
    .select(THREAD_SELECT)
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (opts?.status && opts.status !== 'all') {
    q = q.eq('status', opts.status);
  }

  const { data, error } = await q;
  if (error) throw error;

  let rows = (data as ContactThread[]) ?? [];
  const search = opts?.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter(
      (t) =>
        (t.subject ?? '').toLowerCase().includes(search) ||
        (t.user_email ?? '').toLowerCase().includes(search) ||
        (t.category ?? '').toLowerCase().includes(search)
    );
  }
  return rows;
}

export async function countOpenContactThreads(): Promise<number> {
  const { count, error } = await supabase
    .from('contact_threads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  if (error) return 0;
  return count ?? 0;
}

export async function fetchContactMessages(threadId: string): Promise<ContactMessage[]> {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, thread_id, author_id, author_role, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as ContactMessage[]) ?? [];
}

export async function createContactThread(input: {
  category: ContactCategory;
  body: string;
  subject?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_contact_thread', {
    p_category: input.category,
    p_body: input.body,
    p_subject: input.subject ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function replyAsUser(threadId: string, body: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { error } = await supabase.from('contact_messages').insert({
    thread_id: threadId,
    author_id: user.id,
    author_role: 'user',
    body: body.trim(),
  });
  if (error) throw error;
}

export async function ownerReplyContact(
  threadId: string,
  body: string,
  close = false
): Promise<void> {
  const { error } = await supabase.rpc('owner_reply_contact', {
    p_thread_id: threadId,
    p_body: body,
    p_close: close,
  });
  if (error) throw error;
}

export async function closeContactThread(threadId: string): Promise<void> {
  const { error } = await supabase.rpc('close_contact_thread', {
    p_thread_id: threadId,
  });
  if (error) throw error;
}
