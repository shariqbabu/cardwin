import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  gradient?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  hover = false,
  onClick,
  gradient = false,
}) => {
  return (
    <motion.div
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-white/10 backdrop-blur-sm',
        gradient
          ? 'bg-gradient-to-br from-white/10 to-white/5'
          : 'bg-white/5',
        hover && 'cursor-pointer transition-all duration-200',
        className
      )}
    >
      {children}
    </motion.div>
  );
};
