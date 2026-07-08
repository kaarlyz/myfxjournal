import { ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "DEFINE YOUR GRID",
    description:
      "Start with the underlying structure. Choose your modular grid, define your column count, set your baseline rhythm.",
    color: "#D02020",
    shape: "circle",
  },
  {
    number: "02",
    title: "SELECT YOUR FORMS",
    description:
      "Place the three fundamental shapes. Circles represent unity, squares represent stability, triangles represent direction.",
    color: "#1040C0",
    shape: "square",
  },
  {
    number: "03",
    title: "APPLY COLOR THEORY",
    description:
      "Choose from the Bauhaus primaries. Arrange them by contrast, weight, and visual tension across your composition.",
    color: "#F0C020",
    shape: "rotated",
  },
  {
    number: "04",
    title: "EXPORT & BUILD",
    description:
      "Export SVG, CSS tokens, or print-ready PDF. Your composition becomes the foundation for everything you build.",
    color: "#121212",
    shape: "circle",
  },
];

export function HowItWorks() {
  return (
    <section
      className="py-16 md:py-24 px-4 md:px-8 border-b-4 border-[#121212] bg-white"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3" style={{ backgroundColor: "#F0C020" }} />
          <span
            className="text-[#121212] tracking-widest uppercase"
            style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
          >
            PROCESS
          </span>
        </div>
        <h2
          className="text-[#121212] leading-none mb-14"
          style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(2rem, 5vw, 4rem)" }}
        >
          THE METHOD
        </h2>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-0 relative">
          {/* Connecting line - desktop only */}
          <div
            className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-0.5 bg-[#121212] z-0"
            style={{ top: "2.5rem" }}
          />

          {steps.map((step, i) => (
            <div key={step.number} className="relative flex flex-col items-center text-center px-4 mb-10 md:mb-0">
              {/* Step number shape */}
              <div className="relative z-10 mb-6">
                <div
                  className="w-20 h-20 flex items-center justify-center border-4 border-[#121212] shadow-[6px_6px_0px_0px_#121212]"
                  style={{
                    backgroundColor: step.color,
                    borderRadius: step.shape === "circle" ? "50%" : "0",
                    transform: step.shape === "rotated" ? "rotate(45deg)" : "none",
                  }}
                >
                  <span
                    className="text-white"
                    style={{
                      fontWeight: 900,
                      fontSize: "1.2rem",
                      color: step.color === "#F0C020" ? "#121212" : "white",
                      transform: step.shape === "rotated" ? "rotate(-45deg)" : "none",
                      display: "block",
                    }}
                  >
                    {step.number}
                  </span>
                </div>
              </div>

              {/* Arrow between steps - desktop */}
              {i < steps.length - 1 && (
                <div className="hidden md:flex absolute top-8 -right-3 z-20 w-6 h-6 bg-[#F0F0F0] items-center justify-center">
                  <ArrowRight size={16} strokeWidth={3} color="#121212" />
                </div>
              )}

              <h3
                className="text-[#121212] mb-3 tracking-wide"
                style={{ fontWeight: 900, fontSize: "0.85rem", letterSpacing: "0.1em" }}
              >
                {step.title}
              </h3>
              <p
                className="text-[#121212] max-w-[180px]"
                style={{ fontWeight: 500, fontSize: "0.875rem", lineHeight: "1.6" }}
              >
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
