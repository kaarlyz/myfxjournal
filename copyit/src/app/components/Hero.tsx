import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="border-b-4 border-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 min-h-[85vh]">
        {/* Left: Content */}
        <div className="flex flex-col justify-center py-12 px-6 md:px-12 border-b-4 lg:border-b-0 lg:border-r-4 border-[#121212] bg-[#F0F0F0]">
          {/* Label */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-3 h-3 rounded-full bg-[#D02020]" />
            <span
              className="text-[#121212] tracking-widest uppercase"
              style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
            >
              DESIGN PLATFORM — 2026
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-[#121212] leading-none mb-8"
            style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(3rem, 8vw, 7rem)" }}
          >
            WHERE
            <br />
            <span className="text-[#D02020]">FORM</span>
            <br />
            FOLLOWS
            <br />
            <span className="text-[#1040C0]">FUNCTION</span>
          </h1>

          {/* Body */}
          <p
            className="text-[#121212] mb-10 max-w-md"
            style={{ fontWeight: 500, fontSize: "1.1rem", lineHeight: "1.6" }}
          >
            A geometric composition tool built on Bauhaus principles. Design with purpose.
            Every shape, every color, every line — deliberate.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#"
              className="flex items-center justify-center gap-2 bg-[#121212] text-white px-8 py-4 border-2 border-[#121212] shadow-[6px_6px_0px_0px_#D02020] transition-all duration-200 hover:shadow-[8px_8px_0px_0px_#D02020] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              style={{ fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.12em" }}
            >
              BEGIN COMPOSING
              <ArrowRight size={16} strokeWidth={2.5} />
            </a>
            <a
              href="#"
              className="flex items-center justify-center gap-2 bg-white text-[#121212] px-8 py-4 border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] transition-all duration-200 hover:shadow-[8px_8px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              style={{ fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.12em" }}
            >
              VIEW GALLERY
            </a>
          </div>

          {/* Trust bar */}
          <div className="mt-12 flex items-center gap-6">
            <div className="flex -space-x-2">
              {["#D02020", "#1040C0", "#F0C020", "#121212"].map((color, i) => (
                <div
                  key={i}
                  className="w-9 h-9 rounded-full border-2 border-[#F0F0F0]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <p
              className="text-[#121212]"
              style={{ fontWeight: 500, fontSize: "0.85rem" }}
            >
              <strong style={{ fontWeight: 900 }}>2,400+</strong> designers trust KONSTRUKT
            </p>
          </div>
        </div>

        {/* Right: Geometric Composition */}
        <div className="relative bg-[#1040C0] overflow-hidden min-h-[400px] lg:min-h-auto flex items-center justify-center">
          {/* Dot grid pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(#fff 2px, transparent 2px)",
              backgroundSize: "24px 24px",
            }}
          />

          {/* Geometric composition */}
          <div className="relative w-72 h-72 md:w-96 md:h-96">
            {/* Large background circle */}
            <div className="absolute inset-0 rounded-full border-4 border-white/30" />

            {/* Red filled circle */}
            <div
              className="absolute rounded-full bg-[#D02020] border-4 border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,0.3)]"
              style={{ width: "55%", height: "55%", top: "5%", left: "5%" }}
            />

            {/* Yellow rotated square */}
            <div
              className="absolute bg-[#F0C020] border-4 border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,0.3)]"
              style={{
                width: "48%",
                height: "48%",
                bottom: "5%",
                right: "5%",
                transform: "rotate(45deg)",
              }}
            />

            {/* White inner square */}
            <div
              className="absolute bg-white border-4 border-[#121212] shadow-[6px_6px_0px_0px_rgba(0,0,0,0.4)]"
              style={{
                width: "35%",
                height: "35%",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />

            {/* Triangle */}
            <div
              className="absolute"
              style={{
                bottom: "15%",
                left: "10%",
                width: 0,
                height: 0,
                borderLeft: "30px solid transparent",
                borderRight: "30px solid transparent",
                borderBottom: "52px solid #F0C020",
                filter: "drop-shadow(3px 3px 0px rgba(0,0,0,0.4))",
              }}
            />

            {/* Small red circle accent */}
            <div
              className="absolute w-6 h-6 rounded-full bg-white border-2 border-[#121212]"
              style={{ top: "58%", left: "62%" }}
            />
          </div>

          {/* Corner label */}
          <div className="absolute bottom-6 right-6 text-white/60 text-right">
            <p style={{ fontWeight: 900, fontSize: "0.65rem", letterSpacing: "0.2em" }}>
              GEOMETRIC COMPOSITION
            </p>
            <p style={{ fontWeight: 500, fontSize: "0.65rem" }}>No. 01</p>
          </div>

          {/* Year stamp */}
          <div className="absolute top-6 right-6 w-16 h-16 rounded-full border-2 border-white/30 flex items-center justify-center">
            <span className="text-white" style={{ fontWeight: 900, fontSize: "0.6rem", letterSpacing: "0.05em", textAlign: "center" }}>
              EST<br />1919
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
