import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface Insight {
  label: string;
  value: string | number;
  highlight?: 'positive' | 'negative' | 'neutral';
  icon?: LucideIcon;
}

interface SmartSummaryProps {
  title?: string;
  insights: Insight[];
  className?: string;
}

export function SmartSummary({ title, insights, className = '' }: SmartSummaryProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-wrap gap-3 mb-5 ${className}`}
    >
      {title && (
        <div className="w-full text-[10px] font-extrabold text-[#121212] uppercase tracking-widest mb-1 border-b-2 border-[#121212] pb-1">
          {title}
        </div>
      )}
      {insights.map((insight, idx) => {
        const isPos = insight.highlight === 'positive';
        const isNeg = insight.highlight === 'negative';
        
        return (
          <div key={idx} className="bg-white border-2 border-[#121212] px-3 py-1.5 flex items-center gap-2 shadow-[2px_2px_0px_0px_#121212]">
            {insight.icon && (
              <insight.icon className="w-3.5 h-3.5 text-[#121212]" />
            )}
            <span className="text-[10px] font-bold text-[#717182] uppercase tracking-wider">{insight.label}</span>
            <span className={`text-[12px] font-black ${
              isPos ? 'text-[var(--profit)]' : 
              isNeg ? 'text-[var(--loss)]' : 
              'text-[#121212]'
            }`}>
              {insight.value}
            </span>
          </div>
        );
      })}
    </motion.div>
  );
}
