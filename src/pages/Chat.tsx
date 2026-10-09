import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessagesSquare, Send, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { checkIsAppOwner } from '../lib/ownerAccess';
import { supabase } from '../lib/supabase';
import {
  COMMUNITY_COUNTRIES,
  fetchChatMessages,
  fetchChatRooms,
  fetchMyAppMeta,
  roomAccessible,
  sendChatMessage,
  setMyCommunityCountry,
  subscribeChatMessages,
  ownerSoftDeleteChatMessage,
  type ChatMessage,
  type ChatRoom,
  type ChatRoomSlug,
  type CommunityCountryCode,
} from '../lib/chatApi';

const CLIENT_RATE_MS = 4000;

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function roomLabel(t: (k: string) => string, room: ChatRoom) {
  return t(`chatRoom_${room.slug}`) || room.title;
}

export default function Chat() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const lastSendRef = useRef(0);

  const [selectedSlug, setSelectedSlug] = useState<ChatRoomSlug>('intl');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: isOwner } = useQuery({
    queryKey: ['is-app-owner', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: () => checkIsAppOwner(session!.user.id),
    staleTime: 60_000,
    retry: false,
  });

  const {
    data: meta,
    isLoading: metaLoading,
    error: metaError,
  } = useQuery({
    queryKey: ['user-app-meta', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: fetchMyAppMeta,
    retry: false,
  });

  const {
    data: rooms,
    isLoading: roomsLoading,
    error: roomsError,
  } = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: fetchChatRooms,
    retry: false,
  });

  const countryCode = meta?.country_code ?? null;
  const needsCountry =
    !metaLoading && !isOwner && (!countryCode || !['DE', 'ES', 'UA'].includes(countryCode));

  const activeRoom = useMemo(() => {
    if (!rooms?.length) return null;
    return rooms.find((r) => r.slug === selectedSlug) ?? rooms.find((r) => r.slug === 'intl') ?? rooms[0];
  }, [rooms, selectedSlug]);

  const canUseActive =
    !!activeRoom && roomAccessible(activeRoom, countryCode, !!isOwner);

  const {
    data: history,
    isLoading: msgsLoading,
    error: msgsError,
    refetch: refetchMsgs,
  } = useQuery({
    queryKey: ['chat-messages', activeRoom?.id],
    queryFn: () => fetchChatMessages(activeRoom!.id),
    enabled: !!activeRoom && canUseActive && !needsCountry,
    retry: false,
  });

  // Merge history + live; drop soft-deleted markers
  useEffect(() => {
    setLiveMessages(history ?? []);
  }, [history, activeRoom?.id]);

  useEffect(() => {
    if (!activeRoom || !canUseActive || needsCountry) return;
    return subscribeChatMessages(activeRoom.id, (msg) => {
      setLiveMessages((prev) => {
        if (msg.is_deleted) {
          return prev.filter((m) => m.id !== msg.id);
        }
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });
  }, [activeRoom?.id, canUseActive, needsCountry]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [liveMessages.length, activeRoom?.id]);

  // Prefer home-country room once on first meta load
  const didAutoPick = useRef(false);
  useEffect(() => {
    if (didAutoPick.current || !rooms?.length || !countryCode) return;
    const match = rooms.find((r) => r.country_code === countryCode);
    if (match) {
      setSelectedSlug(match.slug);
      didAutoPick.current = true;
    }
  }, [rooms, countryCode]);

  const onPickCountry = async (code: CommunityCountryCode) => {
    try {
      await setMyCommunityCountry(code);
      await queryClient.invalidateQueries({ queryKey: ['user-app-meta'] });
      const slug = COMMUNITY_COUNTRIES.find((c) => c.code === code)?.slug;
      if (slug) setSelectedSlug(slug);
      showSuccess(t('chatCountrySaved') || 'Country saved');
    } catch {
      showError(t('chatCountryFailed') || 'Could not save country');
    }
  };

  const onSelectRoom = (room: ChatRoom) => {
    if (!roomAccessible(room, countryCode, !!isOwner)) {
      showError(
        (t('chatRoomLocked') || 'Only for users in {country}').replace(
          '{country}',
          room.country_code || room.slug.toUpperCase()
        )
      );
      return;
    }
    setSelectedSlug(room.slug);
  };

  const onSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !activeRoom || !canUseActive) return;
    if (trimmed.length > 1000) {
      showError(t('chatBodyTooLong') || 'Max 1000 characters');
      return;
    }
    const now = Date.now();
    if (now - lastSendRef.current < CLIENT_RATE_MS) {
      showError(t('chatRateLimit') || 'Please wait a few seconds');
      return;
    }
    setSending(true);
    try {
      await sendChatMessage(activeRoom.id, trimmed);
      lastSendRef.current = Date.now();
      setDraft('');
      await refetchMsgs();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('rate_limit')) {
        showError(t('chatRateLimit') || 'Please wait a few seconds');
      } else if (msg.includes('access denied')) {
        showError(t('chatRoomLocked') || 'Room access denied');
      } else {
        showError(t('chatSendFailed') || 'Could not send (apply chat migration?)');
      }
    } finally {
      setSending(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await ownerSoftDeleteChatMessage(id);
      setLiveMessages((prev) => prev.filter((m) => m.id !== id));
      showSuccess(t('chatMessageDeleted') || 'Deleted');
    } catch {
      showError(t('chatDeleteFailed') || 'Delete failed');
    }
  };

  return (
    <div className="min-h-screen pt-2 pb-10 px-4 md:px-6 max-w-2xl mx-auto flex flex-col">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex items-center justify-center p-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl mb-6 transition-all active:scale-95 self-start"
        title={t('back') || 'Back'}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-teal-500/20 rounded-xl flex items-center justify-center">
          <MessagesSquare className="h-4 w-4 text-teal-400" />
        </div>
        <h1 className="text-2xl font-semibold text-white">
          {t('chatTitle') || 'Community'}
        </h1>
      </div>
      <p className="text-white/45 text-sm mb-4">
        {t('chatSubtitle') || 'Country rooms for builders. Be respectful.'}
      </p>

      {(roomsError || metaError) && (
        <p className="text-red-400 text-sm mb-4">
          {t('chatLoadFailed') ||
            'Could not load chat (migration may be missing).'}
        </p>
      )}

      {needsCountry && (
        <div className="bg-white/10 border border-white/10 rounded-2xl p-5 mb-6 space-y-3">
          <p className="text-white text-sm font-medium">
            {t('chatPickCountry') || 'Choose your community country'}
          </p>
          <p className="text-white/45 text-xs">
            {t('chatPickCountryHint') ||
              'Required once. Unlocks your country room + International.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {COMMUNITY_COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => void onPickCountry(c.code)}
                className="px-4 py-2 rounded-xl text-sm border bg-teal-500/15 border-teal-500/40 text-teal-200 hover:bg-teal-500/25 active:scale-95 transition-all"
              >
                {t(`chatCountry_${c.code}`) || c.code}
              </button>
            ))}
          </div>
        </div>
      )}

      {!needsCountry && (
        <>
          <p className="text-white/50 text-xs mb-2">
            {t('chatRoomSelector') || 'Room country'}
            {countryCode ? ` · ${countryCode}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(rooms ?? []).map((room) => {
              const ok = roomAccessible(room, countryCode, !!isOwner);
              const active = activeRoom?.id === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  disabled={!ok}
                  title={
                    ok
                      ? undefined
                      : (t('chatRoomLocked') || 'Only for {country}').replace(
                          '{country}',
                          room.country_code || ''
                        )
                  }
                  onClick={() => onSelectRoom(room)}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition-all active:scale-95 ${
                    active
                      ? 'bg-teal-500/20 border-teal-500/40 text-teal-200'
                      : ok
                        ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        : 'bg-white/[0.03] border-white/5 text-white/25 cursor-not-allowed'
                  }`}
                >
                  {roomLabel(t, room)}
                </button>
              );
            })}
          </div>

          {(roomsLoading || msgsLoading) && (
            <p className="text-white/40 text-sm mb-2">…</p>
          )}
          {msgsError && (
            <p className="text-red-400 text-sm mb-2">
              {t('chatLoadFailed') || 'Could not load messages'}
            </p>
          )}

          <div
            ref={listRef}
            className="flex-1 min-h-[280px] max-h-[50vh] overflow-y-auto space-y-2 mb-4 bg-white/5 border border-white/10 rounded-2xl p-3"
          >
            {liveMessages.length === 0 && !msgsLoading && (
              <p className="text-white/35 text-sm text-center py-8">
                {t('chatEmpty') || 'No messages yet. Say hello.'}
              </p>
            )}
            {liveMessages.map((m) => (
              <div
                key={m.id}
                className="rounded-xl px-3 py-2 bg-white/[0.04] border border-white/10"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs text-teal-300/80 truncate">
                    {m.display_name}
                    <span className="text-white/30"> · {formatTime(m.created_at)}</span>
                  </p>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => void onDelete(m.id)}
                      className="p-1 text-white/30 hover:text-red-400"
                      title={t('chatDelete') || 'Delete'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-white/85 whitespace-pre-wrap break-words">
                  {m.body}
                </p>
              </div>
            ))}
          </div>

          <p className="text-white/35 text-xs mb-2">
            {t('chatRules') ||
              'Rules: no spam, no personal data, be constructive. Owner may remove messages.'}
          </p>

          <div className="flex gap-2 items-end">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              rows={2}
              maxLength={1000}
              disabled={!canUseActive}
              placeholder={t('chatPlaceholder') || 'Write a message…'}
              className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-teal-500/40 text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
            />
            <button
              type="button"
              disabled={sending || !draft.trim() || !canUseActive}
              onClick={() => void onSend()}
              className="shrink-0 h-[42px] w-[42px] flex items-center justify-center rounded-xl bg-teal-500 text-white disabled:opacity-40 active:scale-95 transition-all"
              title={t('chatSend') || 'Send'}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-white/25 mt-1 text-right">{draft.length}/1000</p>
        </>
      )}
    </div>
  );
}
