import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Search, CreditCard as Edit2, Trash2, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { useToastContext } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import { offlineStore } from '../lib/offlineStore';

// Тип одного клієнта.
// Описує, які поля ми очікуємо отримати з таблиці clients.
type Client = {
  id: string;
  user_id?: string;
  client_number?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

// Головна сторінка списку клієнтів.
export const Clients: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showSuccess, showError } = useToastContext();
  const queryClient = useQueryClient();

  // Стан тексту пошуку.
  const [search, setSearch] = useState('');

  // Стан модального вікна підтвердження видалення.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Тут зберігаємо клієнта, якого користувач хоче видалити.
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null);

  // ---------------------------------------------------------
  // 1. Отримання поточної сесії
  // ---------------------------------------------------------
  // Потрібно, щоб:
  // - знати ID поточного користувача
  // - завантажувати лише його клієнтів
  // - видаляти лише його записи
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      return data.session;
    },
  });

  // ---------------------------------------------------------
  // 2. Завантаження списку клієнтів
  // ---------------------------------------------------------
  // Логіка:
  // - якщо офлайн -> беремо з локального сховища
  // - якщо онлайн -> беремо з Supabase
  // - якщо Supabase повернув помилку -> fallback на локальне сховище
  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', session?.user?.id],
    queryFn: async () => {
      const userId = session?.user?.id || '';

      if (!userId) return [];

      if (!navigator.onLine) {
        return offlineStore.getClients(userId);
      }

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Помилка завантаження клієнтів:', error);
        return offlineStore.getClients(userId);
      }

      const rows = (data as Client[]) || [];

      await offlineStore.saveClients(rows);

      return rows;
    },
    enabled: !!session?.user?.id,
  });

  // ---------------------------------------------------------
  // 3. Видалення клієнта
  // ---------------------------------------------------------
  // Видаляємо тільки той запис, який належить поточному користувачу.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const userId = session?.user?.id;

      if (!userId) {
        throw new Error('Користувач не авторизований');
      }

      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] });

      showSuccess(t('clientDeleted') || 'Контакт видалено');

      setDeleteDialogOpen(false);
      setClientToDelete(null);
    },

    onError: (error: any) => {
      console.error('Помилка видалення клієнта:', error);
      showError(error?.message || t('errorDeletingClient') || 'Не вдалося видалити контакт');
    },
  });

  // ---------------------------------------------------------
  // 4. Відкриття діалогу видалення
  // ---------------------------------------------------------
  // stopPropagation потрібен, щоб не спрацьовував клік по всій картці.
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, id: string, name: string) => {
      e.stopPropagation();
      setClientToDelete({ id, name });
      setDeleteDialogOpen(true);
    },
    []
  );

  // ---------------------------------------------------------
  // 5. Підтвердження видалення
  // ---------------------------------------------------------
  const handleDeleteConfirm = useCallback(() => {
    if (clientToDelete) {
      deleteMutation.mutate(clientToDelete.id);
    }
  }, [clientToDelete, deleteMutation]);

  // ---------------------------------------------------------
  // 6. Перегляд контакту
  // ---------------------------------------------------------
  // БЕЗПЕЧНИЙ варіант:
  // ведемо на вже існуючий маршрут редагування,
  // щоб кнопка "око" точно не викидала на головну.
  const handleViewClient = useCallback(
    (e: React.MouseEvent, clientId: string) => {
      e.stopPropagation();
      navigate(`/clients/${clientId}/edit`);
    },
    [navigate]
  );

  // ---------------------------------------------------------
  // 7. Редагування контакту
  // ---------------------------------------------------------
  const handleEditClient = useCallback(
    (e: React.MouseEvent, clientId: string) => {
      e.stopPropagation();
      navigate(`/clients/${clientId}/edit`);
    },
    [navigate]
  );

  // ---------------------------------------------------------
  // 8. Клік по картці
  // ---------------------------------------------------------
  // Теж веде на вже існуючий маршрут, щоб нічого не ламалося.
  const handleCardClick = useCallback(
    (clientId: string) => {
      navigate(`/clients/${clientId}/edit`);
    },
    [navigate]
  );

  // ---------------------------------------------------------
  // 9. Фільтрація клієнтів
  // ---------------------------------------------------------
  // useMemo тут не обов'язковий, але зручний:
  // список не буде перераховуватись зайвий раз без потреби.
  const filteredClients = useMemo(() => {
    const searchValue = search.toLowerCase().trim();

    return clients.filter((client) => {
      return (
        client.name?.toLowerCase().includes(searchValue) ||
        client.email?.toLowerCase().includes(searchValue) ||
        client.address?.toLowerCase().includes(searchValue) ||
        client.client_number?.toLowerCase().includes(searchValue)
      );
    });
  }, [clients, search]);

  return (
    <div className="cpc-page px-3 md:px-6 w-full max-w-[430px] md:max-w-6xl mx-auto">
      {/* Верх сторінки */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-medium" style={{ color: 'var(--cpc-text)' }}>
            {t('clients') || 'Клієнти'}
          </h2>
          <p className="cpc-muted text-sm mt-1">
            {t('manageClients') || 'Керуйте своїми клієнтами'}
          </p>
        </div>

        {/* Кнопка створення нового клієнта */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/clients/new')}
            className="p-2.5 transition-all active:scale-95"
            style={{
              background: 'rgba(200,121,74,0.22)',
              border: '1px solid rgba(224,151,95,0.4)',
              borderRadius: 12,
              color: 'var(--cpc-copper-light)',
            }}
            title={t('addClient') || 'Новий клієнт'}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Блок списку */}
      <div className="cpc-card p-4 md:p-6">
        {/* Поле пошуку */}
        <div className="relative mb-4">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 cpc-muted"
          />
          <input
            type="text"
            placeholder={t('searchClients') || 'Пошук по імені, адресі, номеру...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors"
            style={{
              background: 'var(--cpc-bg)',
              border: '1px solid var(--cpc-line)',
              color: 'var(--cpc-text)',
            }}
          />
        </div>

        {/* Стан завантаження */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="px-4 py-3 rounded-xl animate-pulse">
                <div className="h-4 bg-white/10 rounded w-48 mb-2" />
                <div className="h-3 bg-white/5 rounded w-32" />
              </div>
            ))}
          </div>
        ) : filteredClients.length === 0 ? (
          // Порожній стан
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Users size={32} className="text-orange-400" />
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">
              {search
                ? t('noSearchResults') || 'Нічого не знайдено'
                : t('noClients') || 'Клієнтів ще немає'}
            </h3>

            <p className="text-white/60 mb-6 text-sm">
              {search
                ? t('tryDifferentSearch') || 'Спробуйте інший пошуковий запит'
                : t('addFirstClient') || 'Додайте першого клієнта'}
            </p>

            {!search && (
              <button
                type="button"
                onClick={() => navigate('/clients/new')}
                className="bg-white/10 backdrop-blur-xl border border-white/10 text-orange-500 hover:bg-white/20 px-6 py-2.5 rounded-xl font-medium transition-all active:scale-95"
              >
                {t('addClient') || 'Додати клієнта'}
              </button>
            )}
          </div>
        ) : (
          // Список клієнтів
          <div className="space-y-3">
            {/* Заголовки колонок для desktop */}
            <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 px-4 py-2 text-xs font-medium text-white/50 uppercase">
              <div>{t('name') || "Ім'я"}</div>
              <div>{t('address') || 'Адреса'}</div>
              <div>{t('clientNumber') || 'Номер'}</div>
              <div className="text-right pr-2">{t('actions') || 'Дії'}</div>
            </div>

            {filteredClients.map((client, index) => (
              <motion.div
                key={client.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_auto] gap-3 md:gap-4 px-4 py-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                onClick={() => handleCardClick(client.id)}
              >
                {/* Блок імені та email */}
                <div>
                  <span className="font-medium text-white">
                    {client.name || '—'}
                  </span>

                  {client.email && (
                    <div className="text-sm text-white/50 mt-0.5">
                      {client.email}
                    </div>
                  )}
                </div>

                {/* Адреса */}
                <div className="text-white/60 text-sm truncate">
                  {client.address || '—'}
                </div>

                {/* Номер клієнта */}
                <div className="text-white/60 text-sm">
                  {client.client_number || '—'}
                </div>

                {/* Кнопки дій */}
                <div className="flex items-center gap-2 justify-end">
                  {/* Перегляд */}
                  <button
                    type="button"
                    onClick={(e) => handleViewClient(e, client.id)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 transition-all active:scale-95"
                    title={t('view') || 'Переглянути'}
                  >
                    <Eye size={16} />
                  </button>

                  {/* Редагування */}
                  <button
                    type="button"
                    onClick={(e) => handleEditClient(e, client.id)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-orange-400 transition-all active:scale-95"
                    title={t('edit') || 'Редагувати'}
                  >
                    <Edit2 size={16} />
                  </button>

                  {/* Видалення */}
                  <button
                    type="button"
                    onClick={(e) =>
                      handleDeleteClick(e, client.id, client.name || 'Без назви')
                    }
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-red-400 transition-all active:scale-95"
                    title={t('delete') || 'Видалити'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Підтвердження видалення */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setClientToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title={t('deleteClient') || 'Видалити контакт'}
        description={`${t('confirmDeleteClient') || 'Ви справді хочете видалити'} "${clientToDelete?.name}"? ${t('actionCannotBeUndone') || 'Цю дію не можна скасувати.'}`}
      />
    </div>
  );
};