import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Home, ArrowLeft } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  reason?: string;
  technicalDetails?: string;
  onRetry?: () => void;
  onBack?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Gagal Memproses Data',
  message = 'Terjadi kendala saat memuat atau memproses data Anda.',
  reason = 'Data Anda yang sudah ada tetap aman dan tidak mengalami perubahan.',
  technicalDetails,
  onRetry,
  onBack,
  className = '',
}: ErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      className={`bg-white border-2 border-red-500 p-6 md:p-8 shadow-[5px_5px_0px_0px_#DC2626] space-y-4 max-w-2xl mx-auto ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-4">
        <div className="p-3 bg-red-100 text-red-700 border-2 border-red-300 shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-lg md:text-xl text-red-950 font-display tracking-tight">
            {title}
          </h3>
          <p className="text-xs md:text-sm text-[#3F3F46] font-medium mt-1 leading-relaxed">
            {message}
          </p>
          {reason && (
            <p className="text-xs text-[#059669] font-bold mt-2 bg-emerald-50 px-2.5 py-1.5 border border-emerald-200 inline-block">
              🛡️ {reason}
            </p>
          )}
        </div>
      </div>

      {technicalDetails && (
        <div className="border-t-2 border-dashed border-[#121212]/10 pt-3">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#717182] hover:text-[#121212] transition-colors"
          >
            <span>Detail Teknis</span>
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDetails && (
            <pre className="mt-2 p-3 bg-[#18181B] text-[#A1A1AA] text-[11px] font-mono rounded overflow-x-auto whitespace-pre-wrap max-h-48">
              {technicalDetails}
            </pre>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-3 border-t-2 border-[#121212]/15">
        {onRetry && (
          <Button variant="primary" onClick={onRetry} className="flex items-center gap-2 text-xs font-black">
            <RefreshCw className="w-4 h-4" />
            Coba Lagi
          </Button>
        )}
        {onBack && (
          <Button variant="secondary" onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold">
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </Button>
        )}
      </div>
    </div>
  );
}
