import React from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';

export interface TimelineStep {
  title: string;
  description?: string;
  status: 'complete' | 'current' | 'upcoming';
}

interface ProcessTimelineProps {
  steps: TimelineStep[];
  className?: string;
}

export function ProcessTimeline({ steps, className = '' }: ProcessTimelineProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const isComplete = step.status === 'complete';
        const isCurrent = step.status === 'current';

        return (
          <div key={idx} className="flex items-start gap-3 relative">
            {!isLast && (
              <div
                className={`absolute left-[11px] top-6 bottom-[-8px] w-0.5 ${
                  isComplete ? 'bg-[#059669]' : 'bg-[#E4E4E7]'
                }`}
              />
            )}

            <div className="z-10 mt-0.5 shrink-0">
              {isComplete ? (
                <div className="w-6 h-6 rounded-full bg-[#059669] text-white flex items-center justify-center border-2 border-[#121212]">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              ) : isCurrent ? (
                <div className="w-6 h-6 rounded-full bg-[#1040C0] text-white flex items-center justify-center border-2 border-[#121212] animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-white text-[#A1A1AA] flex items-center justify-center border-2 border-[#D4D4D8]">
                  <Circle className="w-2.5 h-2.5 fill-current" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-2">
              <p
                className={`text-xs font-bold ${
                  isCurrent
                    ? 'text-[#1040C0]'
                    : isComplete
                    ? 'text-[#121212]'
                    : 'text-[#717182]'
                }`}
              >
                {step.title}
              </p>
              {step.description && (
                <p className="text-[11px] text-[#717182] font-normal mt-0.5 leading-snug">
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
