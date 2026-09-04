import React from 'react';
import { Loader2, CheckCircle2, Circle, Clock } from 'lucide-react';

export interface ProgressStage {
  id: string;
  label: string;
  detail?: string;
  status: 'completed' | 'active' | 'pending';
}

interface ContextualLoadingProps {
  title: string;
  subtitle?: string;
  description?: string;
  stages?: ProgressStage[];
  currentStepMessage?: string;
  className?: string;
  isCompact?: boolean;
}

export function ContextualLoading({
  title,
  subtitle,
  description,
  stages,
  currentStepMessage,
  className = '',
  isCompact = false,
}: ContextualLoadingProps) {
  if (isCompact) {
    return (
      <div className={`flex items-center gap-2.5 p-3 bg-blue-50/80 border-2 border-blue-200 text-blue-900 text-xs font-semibold ${className}`}>
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#121212] truncate">{title}</p>
          {currentStepMessage && <p className="text-[11px] text-[#717182] truncate">{currentStepMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border-2 border-[#121212] p-5 md:p-6 shadow-[4px_4px_0px_0px_#121212] space-y-4 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b-2 border-dashed border-[#121212]/15 pb-4">
        <div className="p-2 bg-[#121212] text-white shrink-0 border-2 border-[#121212]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-base md:text-lg text-[#121212] font-display tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs font-bold text-[#717182] uppercase tracking-wider mt-0.5">
              {subtitle}
            </p>
          )}
          {description && (
            <p className="text-xs text-[#52525B] font-medium mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Stage-based progress checklist */}
      {stages && stages.length > 0 && (
        <div className="space-y-2.5 bg-[#F9F9F9] p-3.5 border-2 border-[#121212]/10 rounded-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#717182] mb-2 font-display">
            Tahapan Pengerjaan
          </p>
          {stages.map((stage) => {
            const isDone = stage.status === 'completed';
            const isActive = stage.status === 'active';

            return (
              <div
                key={stage.id}
                className={`flex items-start gap-2.5 text-xs transition-colors ${
                  isActive
                    ? 'text-[#121212] font-bold'
                    : isDone
                    ? 'text-[#059669] font-medium'
                    : 'text-[#A1A1AA] font-normal'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 text-[#1040C0] animate-spin" />
                  ) : (
                    <Circle className="w-4 h-4 text-[#D4D4D8]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={isActive ? 'font-bold text-[#1040C0]' : ''}>{stage.label}</span>
                    {isActive && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-[#1040C0]/10 text-[#1040C0] font-black uppercase tracking-wider rounded">
                        Sedang Berjalan
                      </span>
                    )}
                  </div>
                  {stage.detail && (
                    <p className="text-[11px] text-[#717182] font-normal mt-0.5">{stage.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active step message */}
      {currentStepMessage && (
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1040C0] bg-blue-50 px-3 py-2 border border-blue-200">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{currentStepMessage}</span>
        </div>
      )}
    </div>
  );
}
