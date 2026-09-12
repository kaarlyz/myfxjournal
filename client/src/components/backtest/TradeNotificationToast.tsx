import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowUpRight, ArrowDownRight, AlertCircle, Info } from 'lucide-react';

export type ToastKind = 'TP' | 'SL' | 'ENTRY' | 'CLOSE' | 'ERROR' | 'INFO';

export interface TradeToastItem {
  id: string;
  kind: ToastKind;
  symbol?: string;
  title?: string;
  amount?: number;
  rr?: number | null;
  side?: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
  price?: number;
  lotSize?: number;
  message?: string;
  durationMs?: number;
}

interface TradeNotificationToastProps {
  toast: TradeToastItem | null;
  onDismiss: () => void;
}

export const TradeNotificationToast: React.FC<TradeNotificationToastProps> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    if (!toast) return;
    const duration = toast.durationMs || (toast.kind === 'TP' || toast.kind === 'SL' ? 4000 : 3200);
    const timer = window.setTimeout(() => {
      onDismiss();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  const getAccentColor = (kind: ToastKind) => {
    switch (kind) {
      case 'TP':
        return 'bg-[#059669]';
      case 'SL':
        return 'bg-[#DC2626]';
      case 'ENTRY':
        return 'bg-[#1040C0]';
      case 'ERROR':
        return 'bg-[#D97706]';
      case 'CLOSE':
      case 'INFO':
      default:
        return 'bg-[#121212]';
    }
  };

  return (
    <AnimatePresence mode="wait">
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto w-full max-w-[340px] bg-white border-2 border-[#121212] shadow-[5px_5px_0px_0px_#121212] select-none overflow-hidden"
          role="status"
          aria-live="polite"
        >
          {/* Top colored accent bar */}
          <div className={`h-1.5 w-full ${getAccentColor(toast.kind)}`} />

          <div className="p-3.5 flex items-start gap-3">
            {/* Icon Status Indicator */}
            <div
              className={`w-7 h-7 flex items-center justify-center shrink-0 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] ${
                toast.kind === 'TP'
                  ? 'bg-[#E7F9F0] text-[#059669]'
                  : toast.kind === 'SL'
                  ? 'bg-[#FDECEC] text-[#DC2626]'
                  : toast.kind === 'ENTRY'
                  ? 'bg-[#EBF2FF] text-[#1040C0]'
                  : toast.kind === 'ERROR'
                  ? 'bg-[#FEF3C7] text-[#D97706]'
                  : 'bg-[#F0F0F0] text-[#121212]'
              }`}
            >
              {toast.kind === 'TP' && <Check className="w-4 h-4 stroke-[3]" />}
              {toast.kind === 'SL' && <X className="w-4 h-4 stroke-[3]" />}
              {toast.kind === 'ENTRY' && (
                toast.side === 'LONG' || toast.side === 'BUY' ? (
                  <ArrowUpRight className="w-4 h-4 stroke-[3] text-[#059669]" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 stroke-[3] text-[#DC2626]" />
                )
              )}
              {toast.kind === 'CLOSE' && <Check className="w-4 h-4 stroke-[3] text-[#1040C0]" />}
              {toast.kind === 'ERROR' && <AlertCircle className="w-4 h-4 stroke-[2.5] text-[#D97706]" />}
              {toast.kind === 'INFO' && <Info className="w-4 h-4 stroke-[2.5] text-[#121212]" />}
            </div>

            {/* Content Body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-black tracking-wider uppercase text-[#121212]">
                  {toast.kind === 'TP' && 'TAKE PROFIT'}
                  {toast.kind === 'SL' && 'STOP LOSS'}
                  {toast.kind === 'ENTRY' && `${toast.side || 'ORDER'} EXECUTED`}
                  {toast.kind === 'CLOSE' && 'POSITION CLOSED'}
                  {toast.kind === 'ERROR' && (toast.title || 'ACTION BLOCKED')}
                  {toast.kind === 'INFO' && (toast.title || 'NOTICE')}
                </span>
                {toast.symbol && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-[#F0F0F0] text-[#121212] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
                    {toast.symbol}
                  </span>
                )}
              </div>

              {/* Detail Metrics / PnL */}
              {(toast.kind === 'TP' || toast.kind === 'SL' || toast.kind === 'CLOSE') && toast.amount !== undefined && (
                <div className="mt-1 flex items-baseline gap-2.5 font-mono">
                  <span
                    className={`text-sm font-black font-number ${
                      toast.amount >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
                    }`}
                  >
                    {toast.amount >= 0 ? `+$${toast.amount.toFixed(2)}` : `-$${Math.abs(toast.amount).toFixed(2)}`}
                  </span>
                  {toast.rr !== undefined && toast.rr !== null && (
                    <span className="text-xs font-bold font-number text-[#717182]">
                      {toast.rr >= 0
                        ? `RR 1:${toast.rr.toFixed(2)}`
                        : `${toast.rr.toFixed(2)}R`}
                    </span>
                  )}
                </div>
              )}

              {/* Order Execution Details */}
              {toast.kind === 'ENTRY' && (
                <div className="mt-0.5 text-xs text-[#717182] font-mono font-bold flex items-center gap-2">
                  {toast.price !== undefined && <span className="text-[#121212]">@{toast.price.toFixed(2)}</span>}
                  {toast.lotSize !== undefined && (
                    <span>· {toast.lotSize.toFixed(2)} Lot</span>
                  )}
                </div>
              )}

              {/* Message text for warnings / info */}
              {toast.message && (
                <p className="mt-1 text-xs text-[#717182] font-semibold leading-snug break-words">
                  {toast.message}
                </p>
              )}
            </div>

            {/* Manual Dismiss button */}
            <button
              type="button"
              onClick={onDismiss}
              className="text-[#717182] hover:text-[#121212] hover:bg-[#F0F0F0] transition-colors p-1 -mr-1 -mt-1 cursor-pointer"
              aria-label="Close notification"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

