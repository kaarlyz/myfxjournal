import { useState } from "react";
import { Menu, X } from "lucide-react";

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = ["WORK", "PROCESS", "PRICING", "JOURNAL"];

  return (
    <nav
      className="sticky top-0 z-50 bg-[#F0F0F0] border-b-4 border-[#121212]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16 md:h-20">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <div className="w-5 h-5 rounded-full bg-[#D02020] border-2 border-[#121212]" />
            <div className="w-5 h-5 rounded-none bg-[#1040C0] border-2 border-[#121212] -ml-1" />
            <div
              className="w-0 h-0 -ml-1"
              style={{
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderBottom: "18px solid #F0C020",
                filter: "drop-shadow(1px 1px 0px #121212) drop-shadow(-1px 0px 0px #121212)",
              }}
            />
          </div>
          <span
            className="text-[#121212] tracking-tighter"
            style={{ fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.04em" }}
          >
            KONSTRUKT
          </span>
        </div>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <a
              key={link}
              href="#"
              className="text-[#121212] transition-colors duration-200 hover:text-[#D02020]"
              style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.1em" }}
            >
              {link}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <a
          href="#"
          className="hidden md:flex items-center gap-2 bg-[#D02020] text-white rounded-full px-6 py-2 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] transition-all duration-200 hover:bg-[#D02020]/90 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.1em" }}
        >
          START NOW
        </a>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden w-10 h-10 flex items-center justify-center border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] bg-white transition-all duration-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} strokeWidth={2.5} /> : <Menu size={20} strokeWidth={2.5} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t-4 border-[#121212] bg-[#F0F0F0]">
          {links.map((link, i) => (
            <a
              key={link}
              href="#"
              className="flex items-center px-6 py-4 border-b-2 border-[#121212] hover:bg-[#E0E0E0] transition-colors duration-200"
              style={{ fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.12em" }}
              onClick={() => setMobileOpen(false)}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-white mr-4 text-xs"
                style={{
                  backgroundColor: i === 0 ? "#D02020" : i === 1 ? "#1040C0" : i === 2 ? "#F0C020" : "#121212",
                  color: i === 2 ? "#121212" : "white",
                  fontWeight: 900,
                }}
              >
                {i + 1}
              </span>
              {link}
            </a>
          ))}
          <div className="px-6 py-4">
            <a
              href="#"
              className="flex items-center justify-center w-full bg-[#D02020] text-white rounded-full px-6 py-3 border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212]"
              style={{ fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.1em" }}
            >
              START NOW
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
