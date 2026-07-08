import React from 'react';
import { FileText, LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = FileText, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-12 text-center flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-16 h-16 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-[#121212]" />
      </div>
      <h3 className="font-extrabold text-[15px] text-[#121212] uppercase tracking-wide mb-2">
        {title}
      </h3>
      <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wider max-w-sm mb-6">
        {description}
      </p>
      {action && (
        <div>{action}</div>
      )}
    </motion.div>
  );
}
