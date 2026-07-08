import { useState } from "react";
import { ArrowRight } from "lucide-react";

export function CTA() {
  const [email, setEmail] = useState("");

  return (
    <section
      className="relative py-16 md:py-24 px-4 md:px-8 border-b-4 border-[#121212] bg-[#F0C020] overflow-hidden"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      {/* Large decorative circle — top left */}
      <div
        className="absolute -top-16 -left-16 rounded-full border-4 border-[#121212] opacity-30 pointer-events-none"
        style={{ width: 280, height: 280 }}
      />

      {/* Large decorative rotated square — bottom right */}
      <div
        className="absolute -bottom-16 -right-16 border-4 border-[#121212] opacity-30 pointer-events-none"
        style={{ width: 240, height: 240, transform: "rotate(45deg)" }}
      />

      {/* Small red circle accent */}
      <div
        className="absolute top-12 right-1/3 w-8 h-8 rounded-full bg-[#D02020] border-2 border-[#121212] opacity-60 pointer-events-none"
      />

      <div className="max-w-4xl mx-auto relative z-10 text-center">
        {/* Label */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-3 h-3 rounded-none bg-[#121212]" />
          <span
            className="text-[#121212] tracking-widest uppercase"
            style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
          >
            GET STARTED
          </span>
          <div className="w-3 h-3 rounded-none bg-[#121212]" />
        </div>

        {/* Headline */}
        <h2
          className="text-[#121212] leading-none mb-6"
          style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(2.5rem, 7vw, 6rem)" }}
        >
          BUILD SOMETHING
          <br />
          <span className="text-[#D02020]">THAT MATTERS</span>
        </h2>

        <p
          className="text-[#121212] mb-10 max-w-lg mx-auto"
          style={{ fontWeight: 500, fontSize: "1.05rem", lineHeight: "1.6" }}
        >
          Join 2,400+ designers applying Bauhaus principles to digital composition.
          Start free — no credit card required.
        </p>

        {/* Email form */}
        <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto mb-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 px-5 py-4 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] outline-none focus:shadow-[6px_6px_0px_0px_#121212] transition-all duration-200 placeholder:text-[#A0A0A0]"
            style={{ fontWeight: 500, fontSize: "0.9rem", fontFamily: "Outfit, sans-serif" }}
          />
          <button
            className="flex items-center justify-center gap-2 bg-[#121212] text-white px-8 py-4 border-4 border-[#121212] shadow-[4px_4px_0px_0px_#D02020] transition-all duration-200 hover:shadow-[6px_6px_0px_0px_#D02020] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none whitespace-nowrap"
            style={{ fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.12em" }}
          >
            JOIN FREE
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </div>

        <p
          className="text-[#121212] opacity-60"
          style={{ fontWeight: 500, fontSize: "0.8rem" }}
        >
          14-day Pro trial included. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
