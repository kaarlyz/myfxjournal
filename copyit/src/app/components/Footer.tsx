const footerLinks = [
  {
    heading: "PRODUCT",
    links: ["Grid Composer", "Color Theory", "Type System", "Shape Library", "Export Studio"],
  },
  {
    heading: "RESOURCES",
    links: ["Documentation", "Bauhaus History", "Design Principles", "API Reference", "Changelog"],
  },
  {
    heading: "COMPANY",
    links: ["About KONSTRUKT", "Careers", "Press Kit", "Contact", "Newsletter"],
  },
  {
    heading: "LEGAL",
    links: ["Privacy Policy", "Terms of Use", "Cookie Policy", "Licenses", "Security"],
  },
];

export function Footer() {
  return (
    <footer
      className="bg-[#121212] border-t-4 border-[#D02020]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">
          {/* Brand column */}
          <div className="md:col-span-4">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-0.5">
                <div className="w-5 h-5 rounded-full bg-[#D02020] border-2 border-white/20" />
                <div className="w-5 h-5 rounded-none bg-[#1040C0] border-2 border-white/20 -ml-1" />
                <div
                  className="w-0 h-0 -ml-1"
                  style={{
                    borderLeft: "10px solid transparent",
                    borderRight: "10px solid transparent",
                    borderBottom: "18px solid #F0C020",
                    filter: "drop-shadow(0 0 0 rgba(255,255,255,0.2))",
                  }}
                />
              </div>
              <span
                className="text-white tracking-tighter"
                style={{ fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.04em" }}
              >
                KONSTRUKT
              </span>
            </div>

            <p
              className="text-white/60 mb-8 max-w-xs"
              style={{ fontWeight: 500, fontSize: "0.875rem", lineHeight: "1.7" }}
            >
              A design composition platform built on Bauhaus principles.
              Form follows function. Every time.
            </p>

            {/* Social / geometric decorations */}
            <div className="flex items-center gap-3">
              {[
                { color: "#D02020", shape: "circle" },
                { color: "#1040C0", shape: "square" },
                { color: "#F0C020", shape: "rotated" },
              ].map((item, i) => (
                <button
                  key={i}
                  className="w-10 h-10 border-2 border-white/20 flex items-center justify-center hover:border-white/60 transition-colors duration-200"
                  style={{
                    backgroundColor: "transparent",
                    borderRadius: item.shape === "circle" ? "50%" : "0",
                  }}
                >
                  <div
                    className="w-4 h-4"
                    style={{
                      backgroundColor: item.color,
                      borderRadius: item.shape === "circle" ? "50%" : "0",
                      transform: item.shape === "rotated" ? "rotate(45deg)" : "none",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            {footerLinks.map((col) => (
              <div key={col.heading}>
                <h4
                  className="text-white mb-4 tracking-widest"
                  style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.2em" }}
                >
                  {col.heading}
                </h4>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-white/50 hover:text-white transition-colors duration-200"
                        style={{ fontWeight: 500, fontSize: "0.875rem" }}
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t-2 border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-2 h-2 rounded-full bg-[#D02020]"
            />
            <p
              className="text-white/40"
              style={{ fontWeight: 500, fontSize: "0.8rem" }}
            >
              © 2026 KONSTRUKT. All rights reserved.
            </p>
          </div>
          <p
            className="text-white/30"
            style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.15em" }}
          >
            FORM FOLLOWS FUNCTION — BAUHAUS 1919
          </p>
        </div>
      </div>
    </footer>
  );
}
