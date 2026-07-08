import { Grid, Palette, Type, Shapes, Download, Users } from "lucide-react";

const features = [
  {
    icon: Grid,
    title: "GRID COMPOSER",
    description:
      "Build asymmetric layouts using modular grid systems inspired by the Bauhaus grid theory. Break the grid intentionally.",
    color: "#D02020",
    shape: "circle",
  },
  {
    icon: Palette,
    title: "COLOR THEORY",
    description:
      "Work exclusively with Itten's color wheel. Pure primaries, pure secondaries. No gradients. No compromise.",
    color: "#1040C0",
    shape: "square",
  },
  {
    icon: Type,
    title: "TYPE SYSTEM",
    description:
      "Geometric sans-serif typography with extreme contrast between display and body. Every letter is architecture.",
    color: "#F0C020",
    shape: "rotated",
  },
  {
    icon: Shapes,
    title: "SHAPE LIBRARY",
    description:
      "A curated library of circles, squares, and triangles. The three fundamental forms of all visual composition.",
    color: "#D02020",
    shape: "square",
  },
  {
    icon: Download,
    title: "EXPORT STUDIO",
    description:
      "Export production-ready assets: SVG vectors, CSS design tokens, and print-ready PDF compositions.",
    color: "#1040C0",
    shape: "circle",
  },
  {
    icon: Users,
    title: "COLLABORATION",
    description:
      "Invite your Bauhaus-inspired team. Comment on compositions. Build together across continents.",
    color: "#121212",
    shape: "rotated",
  },
];

const shapeColors = ["#D02020", "#1040C0", "#F0C020"];

export function Features() {
  return (
    <section
      className="py-16 md:py-24 px-4 md:px-8 border-b-4 border-[#121212] bg-[#F0F0F0]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-14 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-none bg-[#1040C0]" />
              <span
                className="text-[#121212] tracking-widest uppercase"
                style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
              >
                CAPABILITIES
              </span>
            </div>
            <h2
              className="text-[#121212] leading-none"
              style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(2rem, 5vw, 4rem)" }}
            >
              BUILT TO
              <br />
              <span className="text-[#D02020]">COMPOSE</span>
            </h2>
          </div>
          <p
            className="text-[#121212] max-w-sm"
            style={{ fontWeight: 500, fontSize: "1rem", lineHeight: "1.6" }}
          >
            Six core tools derived from Bauhaus workshop methodology — each disciplined, each essential.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-4 border-[#121212]">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            const accentColor = shapeColors[i % 3];
            return (
              <div
                key={feature.title}
                className="relative bg-white border-b-2 border-r-0 md:border-r-2 border-[#121212] p-8 group hover:-translate-y-1 transition-transform duration-200 last:border-b-0"
                style={{
                  borderBottom: i >= features.length - (features.length % 3 === 0 ? 3 : features.length % 3) ? "0" : undefined,
                }}
              >
                {/* Corner geometric decoration */}
                <div
                  className="absolute top-4 right-4 w-3 h-3"
                  style={{
                    backgroundColor: accentColor,
                    borderRadius: i % 3 === 0 ? "50%" : "0",
                    transform: i % 3 === 2 ? "rotate(45deg)" : "none",
                  }}
                />

                {/* Icon container */}
                <div
                  className="w-14 h-14 flex items-center justify-center border-2 border-[#121212] mb-6 shadow-[4px_4px_0px_0px_#121212] group-hover:shadow-[6px_6px_0px_0px_#121212] transition-all duration-200"
                  style={{ backgroundColor: accentColor }}
                >
                  <Icon
                    size={24}
                    strokeWidth={2}
                    color={accentColor === "#F0C020" ? "#121212" : "white"}
                  />
                </div>

                {/* Title */}
                <h3
                  className="text-[#121212] mb-3 tracking-wide"
                  style={{ fontWeight: 900, fontSize: "0.9rem", letterSpacing: "0.08em" }}
                >
                  {feature.title}
                </h3>

                {/* Description */}
                <p
                  className="text-[#121212]"
                  style={{ fontWeight: 500, fontSize: "0.9rem", lineHeight: "1.6" }}
                >
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
