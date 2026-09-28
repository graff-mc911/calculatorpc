import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchActiveAnnouncement, type AnnouncementKind } from '../lib/ownerApi';

const KIND_CLASS: Record<AnnouncementKind, string> = {
  info: 'text-white/70',
  promo: 'text-orange-300/90',
  warning: 'text-amber-400',
};

type HeaderAnnouncementProps = {
  /** Compact for mobile header strip */
  compact?: boolean;
  className?: string;
};

/** Existing header middle: site font/style only — no badges or layout redesign. */
export const HeaderAnnouncement: React.FC<HeaderAnnouncementProps> = ({
  compact = false,
  className = '',
}) => {
  const { data } = useQuery({
    queryKey: ['site-announcement-active'],
    queryFn: fetchActiveAnnouncement,
    staleTime: 60_000,
    retry: false,
  });

  if (!data?.body) return null;

  const color = KIND_CLASS[data.kind] || KIND_CLASS.info;

  return (
    <p
      className={`min-w-0 flex-1 text-center truncate ${
        compact ? 'text-xs px-2' : 'text-sm px-4'
      } ${color} ${className}`}
      title={data.body}
    >
      {data.body}
    </p>
  );
};
