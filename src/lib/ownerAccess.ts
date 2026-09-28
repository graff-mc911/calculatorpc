import { supabase } from './supabase';

const OWNER_CACHE_KEY = 'scblight_is_app_owner';
const OWNER_CACHE_TTL_MS = 60_000;

type OwnerCache = { userId: string; isOwner: boolean; at: number };

function readCache(userId: string): boolean | null {
  try {
    const raw = sessionStorage.getItem(OWNER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OwnerCache;
    if (parsed.userId !== userId) return null;
    if (Date.now() - parsed.at > OWNER_CACHE_TTL_MS) return null;
    return parsed.isOwner;
  } catch {
    return null;
  }
}

function writeCache(userId: string, isOwner: boolean) {
  try {
    const payload: OwnerCache = { userId, isOwner, at: Date.now() };
    sessionStorage.setItem(OWNER_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearOwnerAccessCache() {
  try {
    sessionStorage.removeItem(OWNER_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Server-backed owner check (RLS / RPC). Not a UI-only gate. */
export async function checkIsAppOwner(userId?: string | null): Promise<boolean> {
  const uid = userId;
  if (!uid) {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) return false;
    return checkIsAppOwner(id);
  }

  const cached = readCache(uid);
  if (cached !== null) return cached;

  const { data: rpcData, error: rpcError } = await supabase.rpc('is_app_owner');
  if (!rpcError && typeof rpcData === 'boolean') {
    writeCache(uid, rpcData);
    return rpcData;
  }

  // Fallback if RPC not applied yet: direct table probe (RLS still enforces)
  const { data, error } = await supabase
    .from('app_owners')
    .select('user_id')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) {
    writeCache(uid, false);
    return false;
  }

  const isOwner = !!data?.user_id;
  writeCache(uid, isOwner);
  return isOwner;
}
