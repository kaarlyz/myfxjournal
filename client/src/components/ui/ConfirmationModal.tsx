import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from './Button';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  objectName?: string;
  impactItems?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  objectName,
  impactItems,
  confirmLabel = 'Hapus Permanen',
  cancelLabel = 'Batal',
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#121212]/60 backdrop-blur-sm transition-opacity"
        onClick={() => !isLoading && onCancel()}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        className="relative bg-white border-4 border-[#121212] p-6 md:p-8 max-w-md w-full shadow-[8px_8px_0px_0px_#121212] space-y-5 animate-scale-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 text-red-700 border-2 border-red-300 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="modal-title" className="font-black text-lg md:text-xl text-[#121212] font-display tracking-tight">
              {title}
            </h3>
            {objectName && (
              <p className="text-xs font-extrabold text-[#1040C0] bg-blue-50 px-2 py-1 border border-blue-200 mt-1.5 inline-block truncate max-w-full">
                "{objectName}"
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="text-[#717182] hover:text-[#121212] transition-colors p-1"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {impactItems && impactItems.length > 0 && (
          <div className="bg-[#F9F9F9] border-2 border-[#121212]/10 p-3.5 space-y-2 text-xs">
            <p className="font-extrabold text-[#717182] uppercase tracking-wider text-[10px]">
              Tindakan ini akan menghapus permanen:
            </p>
            <ul className="space-y-1 text-[#3F3F46] font-medium list-disc list-inside">
              {impactItems.map((item, idx) => (
                <li key={idx} className="leading-snug">{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-3 border-t-2 border-[#121212]/15">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto text-xs font-bold"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'primary' : 'blue'}
            onClick={onConfirm}
            disabled={isLoading}
            isLoading={isLoading}
            className={`w-full sm:w-auto text-xs font-black ${isDestructive ? 'bg-[#DC2626] hover:bg-[#B91C1C] text-white border-[#121212]' : ''}`}
          >
            {isDestructive && <Trash2 className="w-4 h-4 mr-1.5" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
