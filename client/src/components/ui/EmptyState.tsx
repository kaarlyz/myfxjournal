import React from 'react';
import { FileText, LucideIcon, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  reason?: string;
  action?: React.ReactNode;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  reason,
  action,
  primaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-[#F9F9F9] border-2 border-dashed border-[#121212]/30 p-8 md:p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto ${className}`}
    >
      <div className="w-14 h-14 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center mb-5">
        <Icon className="w-7 h-7 text-[#121212]" />
      </div>
      <h3 className="font-extrabold text-base md:text-lg text-[#121212] tracking-tight mb-1.5 font-display">
        {title}
      </h3>
      <p className="text-xs text-[#52525B] font-medium max-w-sm mb-3 leading-relaxed">
        {description}
      </p>
      {reason && (
        <p className="text-[11px] font-bold text-[#717182] uppercase tracking-wider mb-5 bg-[#E4E4E7] px-3 py-1.5 border border-[#121212]/10">
          💡 {reason}
        </p>
      )}

      {primaryAction && (
        <div className="mt-2">
          <Button
            variant="primary"
            onClick={primaryAction.onClick}
            className="flex items-center gap-2 text-xs font-black shadow-[3px_3px_0px_0px_#121212]"
          >
            {primaryAction.icon || <ArrowRight className="w-4 h-4" />}
            {primaryAction.label}
          </Button>
        </div>
      )}

      {action && (
        <div className="mt-2">{action}</div>
      )}
    </motion.div>
  );
}
