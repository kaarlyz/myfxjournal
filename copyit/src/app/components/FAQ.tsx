import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "WHAT IS KONSTRUKT BASED ON?",
    answer:
      "KONSTRUKT is built on the foundational principles of the Bauhaus school (1919–1933), specifically the workshop model where art and craft were unified. Every feature maps to a Bauhaus workshop discipline: Vorkurs (foundation), Typography, Color Theory, and Spatial Composition.",
  },
  {
    question: "WHY ONLY PRIMARY COLORS?",
    answer:
      "Johannes Itten's color theory, central to the Bauhaus curriculum, demonstrated that pure primaries — red, blue, and yellow — contain infinite expressive potential when composed with intention. Constraints produce creativity. We enforce the palette so you can't hide behind complexity.",
  },
  {
    question: "CAN I USE CUSTOM TYPEFACES?",
    answer:
      "Pro and Studio plans support custom typeface uploads. However, all typefaces are rendered through our Bauhaus type grid, which enforces the proportional relationships between display, subheading, and body sizes. You set the face; KONSTRUKT sets the structure.",
  },
  {
    question: "HOW DOES COLLABORATION WORK?",
    answer:
      "Studio-plan teams share a workspace where compositions are version-controlled. Each state is a named snapshot — like a frame in a film. Team members can comment on specific shapes or color relationships. No real-time cursors. Bauhaus collaboration was deliberate, not chaotic.",
  },
  {
    question: "WHAT EXPORT FORMATS DO YOU SUPPORT?",
    answer:
      "SVG (editable vector), CSS custom properties (design tokens), JSON (for code integration), and print-ready PDF at 300dpi. Pro plan adds CSS-in-JS and Figma-compatible token export. All exports include the underlying grid structure as a reference layer.",
  },
  {
    question: "IS THERE A FREE TRIAL FOR PRO?",
    answer:
      "Yes — 14 days, no credit card required. The trial is a full Pro experience: unlimited compositions, all exports, custom palette. After 14 days, compositions are read-only unless you upgrade. Your work is never deleted.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      className="py-16 md:py-24 px-4 md:px-8 border-b-4 border-[#121212] bg-white"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left column */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-[#D02020]" />
              <span
                className="text-[#121212] tracking-widest uppercase"
                style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
              >
                FAQ
              </span>
            </div>
            <h2
              className="text-[#121212] leading-none mb-6"
              style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(2rem, 4vw, 3.5rem)" }}
            >
              COMMON
              <br />
              <span className="text-[#D02020]">QUESTIONS</span>
            </h2>
            <p
              className="text-[#121212] mb-8"
              style={{ fontWeight: 500, fontSize: "0.95rem", lineHeight: "1.6" }}
            >
              The Bauhaus believed that education began with asking the right questions. Here are the ones we hear most.
            </p>

            {/* Geometric decoration */}
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full border-4 border-[#E0E0E0]" />
              <div
                className="absolute bg-[#D02020] border-4 border-[#121212]"
                style={{ width: "60%", height: "60%", top: "20%", left: "20%" }}
              />
              <div
                className="absolute bg-[#F0C020] border-2 border-[#121212] opacity-80"
                style={{
                  width: "40%",
                  height: "40%",
                  bottom: "5%",
                  right: "0%",
                  transform: "rotate(45deg)",
                }}
              />
            </div>
          </div>

          {/* Right column — accordion */}
          <div className="lg:col-span-8 space-y-3">
            {faqs.map((faq, i) => {
              const isOpen = openIndex === i;
              return (
                <div
                  key={faq.question}
                  className="border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] transition-all duration-200"
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className={`w-full flex items-center justify-between gap-4 px-6 py-5 text-left transition-colors duration-200 ${
                      isOpen ? "bg-[#D02020]" : "bg-white hover:bg-[#F0F0F0]"
                    }`}
                  >
                    <span
                      className={isOpen ? "text-white" : "text-[#121212]"}
                      style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.08em" }}
                    >
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={20}
                      strokeWidth={2.5}
                      color={isOpen ? "white" : "#121212"}
                      className={`flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="bg-[#FFF9C4] border-t-4 border-[#121212] px-6 py-5">
                      <p
                        className="text-[#121212]"
                        style={{ fontWeight: 500, fontSize: "0.9rem", lineHeight: "1.7" }}
                      >
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
