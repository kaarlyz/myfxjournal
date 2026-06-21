import React, { useState } from 'react';
import { HelpCircle, Info, X } from 'lucide-react';

type GuideSection = {
  title: string;
  body: string;
};

export function HelpCard({ title, children, tone = 'info' }: { title: string; children: React.ReactNode; tone?: 'info' | 'warning' }) {
  const color = tone === 'warning' ? '#f0b90b' : '#fcd535';
  return (
    <div className="rounded-xl border border-[#2b3139] bg-[#181a20] p-4">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <div className="mt-1 text-xs leading-6 text-[#929aa5]">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <HelpCircle className="h-3.5 w-3.5 text-[#707a8a]" />
      <span className="pointer-events-none absolute left-1/2 top-5 z-40 hidden w-64 -translate-x-1/2 rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3 text-[11px] leading-5 text-[#eaecef] shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

export function EmptyStateGuide({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bn-card p-8 text-center">
      <HelpCircle className="mx-auto h-10 w-10 text-[#707a8a]" />
      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#929aa5]">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
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
        className="inline-flex items-center gap-2 rounded-lg border border-[#2b3139] bg-[#181a20] px-3 py-2 text-xs font-bold text-[#eaecef] hover:border-[#fcd535] hover:text-[#fcd535]"
      >
        <HelpCircle className="h-4 w-4" />
        Cara pakai
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70">
          <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-[#2b3139] bg-[#0b0e11] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#2b3139] pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#fcd535]">Panduan</p>
                <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-[#707a8a] hover:bg-[#181a20] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {sections.map((section) => (
                <div key={section.title} className="rounded-xl border border-[#2b3139] bg-[#181a20] p-4">
                  <h3 className="text-sm font-bold text-white">{section.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[#c7ccd4]">{section.body}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
