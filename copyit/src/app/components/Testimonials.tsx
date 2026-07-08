import { Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "KONSTRUKT changed how I think about layout. I stopped adding decorative elements and started composing with intention. My clients say my work is more 'architectural' now.",
    name: "ELENA MÜLLER",
    role: "UI DESIGNER, BERLIN",
    color: "#D02020",
    initial: "E",
  },
  {
    quote:
      "The constraint of three colors felt limiting for the first hour. By day two, I'd produced the most coherent design system I've ever built. Limits are the point.",
    name: "JAMES OKAFOR",
    role: "PRODUCT DESIGNER, LAGOS",
    color: "#1040C0",
    initial: "J",
  },
  {
    quote:
      "I used to reach for gradients and drop shadows to add depth. Now I use geometry and color weight. My compositions read from across the room.",
    name: "YUKI TANAKA",
    role: "ART DIRECTOR, TOKYO",
    color: "#121212",
    initial: "Y",
  },
];

export function Testimonials() {
  return (
    <section
      className="py-16 md:py-24 px-4 md:px-8 border-b-4 border-[#121212] bg-[#D02020]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-3 h-3 rounded-full bg-[#F0C020]" />
          <span
            className="text-white tracking-widest uppercase"
            style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
          >
            TESTIMONIALS
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.25)] p-8 relative group hover:-translate-y-1 transition-transform duration-200"
            >
              {/* Quote icon */}
              <div
                className="w-12 h-12 flex items-center justify-center border-2 border-[#121212] mb-6"
                style={{ backgroundColor: ["#D02020", "#1040C0", "#F0C020"][i] }}
              >
                <Quote
                  size={20}
                  strokeWidth={2}
                  color={i === 2 ? "#121212" : "white"}
                />
              </div>

              {/* Corner shape */}
              <div
                className="absolute top-4 right-4 w-3 h-3"
                style={{
                  backgroundColor: ["#D02020", "#1040C0", "#F0C020"][i],
                  borderRadius: i === 0 ? "50%" : "0",
                  transform: i === 2 ? "rotate(45deg)" : "none",
                }}
              />

              {/* Quote */}
              <p
                className="text-[#121212] mb-8"
                style={{ fontWeight: 500, fontSize: "0.9rem", lineHeight: "1.7", fontStyle: "italic" }}
              >
                "{t.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4 border-t-2 border-[#E0E0E0] pt-6">
                <div
                  className="w-10 h-10 rounded-full border-2 border-[#121212] flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: t.color }}
                >
                  <span
                    className="text-white"
                    style={{ fontWeight: 900, fontSize: "0.85rem", color: t.color === "#F0C020" ? "#121212" : "white" }}
                  >
                    {t.initial}
                  </span>
                </div>
                <div>
                  <p
                    className="text-[#121212]"
                    style={{ fontWeight: 900, fontSize: "0.75rem", letterSpacing: "0.05em" }}
                  >
                    {t.name}
                  </p>
                  <p
                    className="text-[#717182]"
                    style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.1em" }}
                  >
                    {t.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
