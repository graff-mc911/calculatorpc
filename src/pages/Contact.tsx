import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import {
  closeContactThread,
  createContactThread,
  fetchContactMessages,
  fetchMyContactThreads,
  replyAsUser,
  type ContactCategory,
  type ContactStatus,
  type ContactThread,
} from '../lib/contactApi';

const CATEGORIES: ContactCategory[] = ['question', 'complaint', 'suggestion', 'other'];

function categoryLabel(t: (k: string) => string, cat: ContactCategory) {
  return t(`contactCat_${cat}`) || cat;
}

function statusLabel(t: (k: string) => string, status: ContactStatus) {
  return t(`contactStatus_${status}`) || status;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function Contact() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<ContactCategory>('question');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: threads, isLoading, error } = useQuery({
    queryKey: ['my-contact-threads'],
    queryFn: fetchMyContactThreads,
    retry: false,
  });

  const onSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      showError(t('contactBodyTooLong') || 'Max 2000 characters');
      return;
    }
    setSending(true);
    try {
      const id = await createContactThread({ category, body: trimmed });
      setBody('');
      setCategory('question');
      await queryClient.invalidateQueries({ queryKey: ['my-contact-threads'] });
      setOpenId(id);
      showSuccess(t('contactSent') || 'Sent');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('rate_limit')) {
        showError(t('contactRateLimit') || 'Limit: 5 messages per day');
      } else {
        showError(t('contactSendFailed') || 'Could not send. Apply Contact Us migration.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen pt-2 pb-10 px-4 md:px-6 max-w-2xl mx-auto">
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="flex items-center justify-center p-2 bg-white/10 backdrop-blur-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/20 rounded-xl mb-6 transition-all active:scale-95"
        title={t('back') || 'Back'}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-orange-500/20 rounded-xl flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-orange-400" />
        </div>
        <h1 className="text-2xl font-semibold text-white">
          {t('contactUs') || 'Contact us'}
        </h1>
      </div>
      <p className="text-white/45 text-sm mb-6">
        {t('contactUsHint') ||
          'Briefly describe a question, complaint, or idea. We reply in the app.'}
      </p>

      <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-6 space-y-4">
        <div>
          <p className="text-sm text-white/60 mb-2">{t('contactTopic') || 'Topic'}</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-xl text-sm border transition-all active:scale-95 ${
                  category === c
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {categoryLabel(t, c)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">
            {t('contactMessage') || 'Message'}
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            rows={5}
            maxLength={2000}
            placeholder={t('contactMessagePlaceholder') || 'Your message…'}
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/40 text-sm resize-y"
          />
          <p className="text-xs text-white/30 mt-1 text-right">{body.length}/2000</p>
        </div>

        <button
          type="button"
          disabled={sending || !body.trim()}
          onClick={() => void onSend()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 active:scale-95 transition-all"
        >
          <Send className="h-4 w-4" />
          {sending ? (t('sending') || 'Sending…') : (t('contactSend') || 'Send')}
        </button>
      </div>

      <h2 className="text-lg font-medium text-white mb-3">
        {t('contactHistory') || 'My requests'}
      </h2>

      {isLoading && <p className="text-white/40 text-sm">…</p>}
      {error && (
        <p className="text-red-400 text-sm">
          {t('contactLoadFailed') || 'Could not load history (migration may be missing).'}
        </p>
      )}
      {!isLoading && !error && (!threads || threads.length === 0) && (
        <p className="text-white/40 text-sm">{t('contactEmpty') || 'No requests yet.'}</p>
      )}

      <ul className="space-y-2">
        {(threads ?? []).map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => setOpenId(openId === thread.id ? null : thread.id)}
              className="w-full text-left bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-4 py-3 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">
                    {formatDate(thread.created_at)} · {categoryLabel(t, thread.category)}
                  </p>
                  <p className="text-white/40 text-xs truncate mt-0.5">
                    {thread.subject || '—'}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-lg border ${
                    thread.status === 'open'
                      ? 'border-orange-500/30 text-orange-300'
                      : thread.status === 'answered'
                        ? 'border-green-500/30 text-green-300'
                        : 'border-white/20 text-white/50'
                  }`}
                >
                  {statusLabel(t, thread.status)}
                </span>
              </div>
            </button>
            {openId === thread.id && (
              <ThreadDetail
                thread={thread}
                onChanged={() =>
                  void queryClient.invalidateQueries({ queryKey: ['my-contact-threads'] })
                }
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadDetail({
  thread,
  onChanged,
}: {
  thread: ContactThread;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ['contact-messages', thread.id],
    queryFn: () => fetchContactMessages(thread.id),
  });

  const canReply = thread.status !== 'closed';

  const onReply = async () => {
    const trimmed = reply.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await replyAsUser(thread.id, trimmed);
      setReply('');
      await refetch();
      onChanged();
      showSuccess(t('contactSent') || 'Sent');
    } catch {
      showError(t('contactSendFailed') || 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  const onClose = async () => {
    setBusy(true);
    try {
      await closeContactThread(thread.id);
      onChanged();
      showSuccess(t('contactClosed') || 'Closed');
    } catch {
      showError(t('contactSendFailed') || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const msgs = useMemo(() => messages ?? [], [messages]);

  return (
    <div className="mt-2 mb-3 ml-1 pl-3 border-l border-white/10 space-y-3">
      {isLoading && <p className="text-white/40 text-xs">…</p>}
      {msgs.map((m) => (
        <div
          key={m.id}
          className={`rounded-xl px-3 py-2 text-sm ${
            m.author_role === 'owner'
              ? 'bg-orange-500/10 border border-orange-500/20 text-orange-100'
              : 'bg-white/5 border border-white/10 text-white/80'
          }`}
        >
          <p className="text-xs text-white/40 mb-1">
            {m.author_role === 'owner'
              ? t('contactOwnerReply') || 'Owner'
              : t('contactYou') || 'You'}{' '}
            · {formatDate(m.created_at)}
          </p>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}

      {canReply && (
        <div className="space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, 2000))}
            rows={3}
            maxLength={2000}
            placeholder={t('contactFollowUp') || 'Follow-up…'}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !reply.trim()}
              onClick={() => void onReply()}
              className="flex-1 py-2 rounded-xl bg-orange-500/80 text-white text-sm disabled:opacity-50"
            >
              {t('contactSend') || 'Send'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onClose()}
              className="px-3 py-2 rounded-xl bg-white/10 text-white/60 text-sm"
            >
              {t('contactClose') || 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
