import React, { useState } from 'react';
import { HelpCircle, Info, X } from 'lucide-react';

type GuideSection = {
  title: string;
  body: string;
};

export function HelpCard({ title, children, tone = 'info' }: { title: string; children: React.ReactNode; tone?: 'info' | 'warning' | 'neutral' }) {
  const isWarning = tone === 'warning';
  const colorClass = isWarning ? 'var(--warning)' : '#1040C0';
  const bgClass = isWarning ? 'var(--warning-dim)' : 'rgba(16, 64, 192, 0.08)';

  return (
    <div className={`bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] relative`}>
      <div className={`absolute top-0 left-0 bottom-0 w-2`} style={{ backgroundColor: colorClass }} />
      <div className="flex items-start gap-3 ml-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.5} style={{ color: colorClass }} />
        <div>
          <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide">{title}</h3>
          <div className="mt-2 text-[13px] font-bold leading-relaxed text-[#717182]">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <HelpCircle className="h-4 w-4 text-[#717182] cursor-help" />
      <span className="pointer-events-none absolute left-1/2 top-6 z-40 hidden w-64 -translate-x-1/2 bg-white border-2 border-[#121212] p-3 text-[12px] font-bold leading-5 text-[#121212] shadow-[4px_4px_0px_0px_#121212] group-hover:block uppercase tracking-wider">
        {text}
      </span>
    </span>
  );
}

export function EmptyStateGuide({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-10 text-center flex flex-col items-center">
      <div className="p-4 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] mb-5">
        <HelpCircle className="h-8 w-8 text-[#121212]" strokeWidth={2} />
      </div>
      <h3 className="text-[16px] font-extrabold text-[#121212] uppercase tracking-wide">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-[13px] font-bold leading-relaxed text-[#717182]">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function PageGuide({ title, purpose, steps, outputs, warnings, nextAction }: {
  title: string;
  purpose: string;
  steps: string[];
  outputs?: string[];
  warnings?: string[];
  nextAction?: string;
}) {
  const [open, setOpen] = useState(false);
  const sections: GuideSection[] = [
    { title: 'Fungsi halaman', body: purpose },
    { title: 'Cara pakai', body: steps.map((step, i) => `${i + 1}. ${step}`).join('\n') },
    ...(outputs?.length ? [{ title: 'Arti output', body: outputs.join('\n') }] : []),
    ...(warnings?.length ? [{ title: 'Masalah umum', body: warnings.join('\n') }] : []),
    ...(nextAction ? [{ title: 'Langkah berikutnya', body: nextAction }] : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-white border-2 border-[#121212] px-3 py-2 text-[11px] font-extrabold text-[#121212] uppercase tracking-widest shadow-[2px_2px_0px_0px_#121212] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#121212] transition-all active:translate-y-0.5 active:shadow-none"
      >
        <HelpCircle className="h-4 w-4" strokeWidth={2.5} />
        Cara pakai
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#121212]/80 backdrop-blur-sm animate-fade-in">
          <aside className="h-full w-full max-w-lg overflow-y-auto border-l-4 border-[#121212] bg-[#F0F0F0] p-6 shadow-[-16px_0px_0px_0px_rgba(0,0,0,0.2)] animate-slide-right flex flex-col relative">
            <div className="flex items-start justify-between gap-4 border-b-4 border-[#121212] pb-5 shrink-0">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-white bg-[#1040C0] px-2 py-0.5 inline-block border-2 border-[#121212]">Panduan</p>
                <h2 className="mt-3 text-2xl font-extrabold text-[#121212] font-display uppercase tracking-wide">{title}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="bg-white border-2 border-[#121212] p-2 text-[#121212] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#E0E0E0] active:translate-y-0.5 active:shadow-none transition-all">
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-6 space-y-6 flex-1 overflow-y-auto pr-2 pb-8">
              {sections.map((section) => (
                <div key={section.title} className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
                  <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide border-b-2 border-[#121212]/10 pb-2 mb-3">{section.title}</h3>
                  <p className="whitespace-pre-line text-[13px] font-bold leading-relaxed text-[#717182]">{section.body}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
