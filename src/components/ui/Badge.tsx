import React from 'react';
import { cn } from '../../utils/cn';
import { getStatusBg } from '../../utils/helpers';

interface BadgeProps {
  status: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className }) => {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        getStatusBg(status),
        className
      )}
    >
      {status}
    </span>
  );
};
