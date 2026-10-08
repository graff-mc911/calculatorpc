import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import {
  isMissingNoteColumnError,
  resolveClientNote,
  writeLocalClientNote,
} from '../lib/clientContact';
import { supabase } from '../lib/supabase';

type ClientFormData = {
  client_number: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  note: string;
};

/** Simple contact form — name + phone; optional email/address/note. Not CRM. */
export const ClientForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<ClientFormData>({
    client_number: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    note: '',
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
  });

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', id, session?.user?.id],
    queryFn: async () => {
      if (!id || !session?.user?.id) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!session?.user?.id,
  });

  useEffect(() => {
    if (client) {
      setFormData({
        client_number: client.client_number || '',
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        note: resolveClientNote(client.id, (client as { note?: string | null }).note),
      });
    }
  }, [client]);

  useEffect(() => {
    if (!id && session?.user?.id) {
      void generateClientNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.user?.id]);

  const generateClientNumber = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('clients')
      .select('client_number')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNumber = 1;
    if (data?.client_number) {
      const match = data.client_number.match(/\d+$/);
      if (match) nextNumber = parseInt(match[0], 10) + 1;
    }
    setFormData((prev) => ({
      ...prev,
      client_number: `CLI-${String(nextNumber).padStart(4, '0')}`,
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error('Користувач не авторизований');
      const name = formData.name.trim();
      if (!name) throw new Error('Введіть ім’я клієнта');

      let clientNumber = formData.client_number.trim();
      if (!clientNumber) {
        clientNumber = `CLI-${Date.now().toString().slice(-4)}`;
      }

      const note = formData.note.trim() || null;
      const base = {
        client_number: clientNumber,
        name,
        email: formData.email.trim().toLowerCase() || null,
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        user_id: session.user.id,
      };
      const withNote = { ...base, note };

      const persistLocalNote = (savedId: string) => {
        writeLocalClientNote(savedId, note || '');
      };

      if (id) {
        const stamp = { updated_at: new Date().toISOString() };
        let { error } = await supabase
          .from('clients')
          .update({ ...withNote, ...stamp })
          .eq('id', id)
          .eq('user_id', session.user.id);
        if (error && isMissingNoteColumnError(error)) {
          ({ error } = await supabase
            .from('clients')
            .update({ ...base, ...stamp })
            .eq('id', id)
            .eq('user_id', session.user.id));
          if (!error) persistLocalNote(id);
        } else if (!error) {
          persistLocalNote(id);
        }
        if (error) throw error;
        return id;
      }

      let { data, error } = await supabase
        .from('clients')
        .insert([withNote])
        .select('id')
        .single();
      if (error && isMissingNoteColumnError(error)) {
        ({ data, error } = await supabase
          .from('clients')
          .insert([base])
          .select('id')
          .single());
      }
      if (error) throw error;
      const savedId = data!.id as string;
      persistLocalNote(savedId);
      return savedId;
    },
    onSuccess: async (savedId) => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      await queryClient.invalidateQueries({ queryKey: ['client', savedId] });
      showSuccess(t('clientSaved') || 'Клієнта збережено');
      navigate(`/clients/${savedId}`);
    },
    onError: (error: any) => {
      showError(error?.message || t('errorSavingClient') || 'Не вдалося зберегти');
    },
  });

  const isPageLoading = sessionLoading || (Boolean(id) && clientLoading);

  const fieldStyle: React.CSSProperties = {
    background: 'var(--cpc-bg)',
    border: '1px solid var(--cpc-line)',
    borderRadius: 10,
    color: 'var(--cpc-text)',
  };

  return (
    <div className="cpc-page w-full mx-auto min-w-0 pb-6 max-w-xl lg:max-w-none">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => navigate(id ? `/clients/${id}` : '/clients')}
          className="w-10 h-10 flex items-center justify-center bg-transparent border-0"
          style={{ color: 'var(--cpc-muted)' }}
          aria-label={t('back') || 'Назад'}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-medium" style={{ color: 'var(--cpc-text)' }}>
          {id ? 'Редагувати' : 'Новий клієнт'}
        </h1>
      </div>

      {isPageLoading ? (
        <div className="cpc-card h-40 animate-pulse" />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="cpc-card space-y-3"
        >
          <div>
            <label className="cpc-card-label mb-1 block">Ім’я</label>
            <input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Іван Петренко"
              className="w-full min-h-[48px] text-[16px] px-3 outline-none"
              style={fieldStyle}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="cpc-card-label mb-1 block">Телефон</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+49 …"
              className="w-full min-h-[48px] text-[16px] px-3 outline-none"
              style={fieldStyle}
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="cpc-card-label mb-1 block">Email — необов’язково</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="name@email.com"
              className="w-full min-h-[44px] text-[15px] px-3 outline-none"
              style={fieldStyle}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="cpc-card-label mb-1 block">Адреса — необов’язково</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Вулиця, місто"
              rows={2}
              className="w-full text-[15px] px-3 py-2.5 outline-none resize-none"
              style={fieldStyle}
            />
          </div>

          <div>
            <label className="cpc-card-label mb-1 block">Нотатка — необов’язково</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Коротка пам’ятка про контакт"
              rows={3}
              className="w-full text-[15px] px-3 py-2.5 outline-none resize-none"
              style={fieldStyle}
            />
          </div>

          <p className="cpc-muted text-[11px]">
            Простий контакт для об’єктів — не CRM.
          </p>

          <button
            type="submit"
            disabled={saveMutation.isPending || !session?.user?.id}
            className="cpc-btn-primary w-full min-h-[52px] text-[16px] font-medium disabled:opacity-40"
          >
            {saveMutation.isPending ? 'Зберігаємо…' : 'Зберегти'}
          </button>
        </form>
      )}
    </div>
  );
};
