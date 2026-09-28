import { supabase } from './supabase';

export type ChatRoomSlug = 'de' | 'es' | 'ua' | 'intl';
export type CommunityCountryCode = 'DE' | 'ES' | 'UA';

export type ChatRoom = {
  id: string;
  slug: ChatRoomSlug;
  country_code: CommunityCountryCode | null;
  title: string;
  is_active: boolean;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  body: string;
  is_deleted: boolean;
  created_at: string;
};

export type UserAppMeta = {
  user_id: string;
  country_code: string | null;
  country_source: string | null;
  updated_at: string;
};

const ROOM_SELECT = 'id, slug, country_code, title, is_active';
const MSG_SELECT = 'id, room_id, user_id, display_name, body, is_deleted, created_at';

export const COMMUNITY_COUNTRIES: Array<{
  code: CommunityCountryCode;
  slug: Exclude<ChatRoomSlug, 'intl'>;
}> = [
  { code: 'DE', slug: 'de' },
  { code: 'ES', slug: 'es' },
  { code: 'UA', slug: 'ua' },
];

export function roomAccessible(
  room: ChatRoom,
  countryCode: string | null | undefined,
  isOwner = false
): boolean {
  if (isOwner) return true;
  if (room.slug === 'intl') return true;
  return !!countryCode && room.country_code === countryCode;
}

export async function fetchChatRooms(): Promise<ChatRoom[]> {
  const { data, error } = await supabase
    .from('chat_rooms')
    .select(ROOM_SELECT)
    .eq('is_active', true)
    .order('slug', { ascending: true });

  if (error) throw error;
  const rooms = (data as ChatRoom[]) ?? [];
  // Preferred order: DE, ES, UA, International
  const order: ChatRoomSlug[] = ['de', 'es', 'ua', 'intl'];
  return [...rooms].sort(
    (a, b) => order.indexOf(a.slug) - order.indexOf(b.slug)
  );
}

export async function fetchMyAppMeta(): Promise<UserAppMeta | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_app_meta')
    .select('user_id, country_code, country_source, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as UserAppMeta) ?? null;
}

export async function setMyCommunityCountry(
  country: CommunityCountryCode
): Promise<void> {
  const { error } = await supabase.rpc('set_my_community_country', {
    p_country_code: country,
  });
  if (error) throw error;
}

export async function fetchChatMessages(
  roomId: string,
  limit = 80
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MSG_SELECT)
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = (data as ChatMessage[]) ?? [];
  return rows.reverse();
}

export async function fetchOwnerChatMessages(
  roomId: string,
  limit = 100
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MSG_SELECT)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data as ChatMessage[]) ?? []).reverse();
}

export async function sendChatMessage(
  roomId: string,
  body: string
): Promise<string> {
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_room_id: roomId,
    p_body: body,
  });
  if (error) throw error;
  return data as string;
}

export async function ownerSoftDeleteChatMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('owner_soft_delete_chat_message', {
    p_message_id: messageId,
  });
  if (error) throw error;
}

/** Subscribe to new inserts in a room. Returns unsubscribe. */
export function subscribeChatMessages(
  roomId: string,
  onInsert: (msg: ChatMessage) => void
): () => void {
  const channel = supabase
    .channel(`chat-room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessage;
        if (row && !row.is_deleted) onInsert(row);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessage;
        if (row?.is_deleted) {
          onInsert({ ...row, body: '', is_deleted: true });
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
