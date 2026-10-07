import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  return (
    <div
      className={`transition-all ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''} ${className}`}
      style={{
        background: 'var(--cpc-card)',
        border: '1px solid var(--cpc-line)',
        borderRadius: 12,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
