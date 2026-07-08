export function Stats() {
  const stats = [
    { value: "2,400+", label: "DESIGNERS", shape: "circle", color: "#D02020" },
    { value: "98%", label: "SATISFACTION", shape: "square", color: "#1040C0" },
    { value: "12", label: "COUNTRIES", shape: "rotated", color: "#121212" },
    { value: "4 YRS", label: "RUNNING", shape: "circle", color: "#D02020" },
  ];

  return (
    <section
      className="bg-[#F0C020] border-b-4 border-[#121212]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y-2 lg:divide-y-0 divide-x-0 lg:divide-x-4 divide-[#121212]">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center justify-center py-10 px-6 text-center relative group"
            >
              {/* Background shape */}
              <div
                className="absolute top-4 right-4 opacity-20"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: "#121212",
                  borderRadius: stat.shape === "circle" ? "50%" : "0",
                  transform: stat.shape === "rotated" ? "rotate(45deg)" : "none",
                }}
              />

              {/* Value */}
              <span
                className="text-[#121212] leading-none mb-2"
                style={{ fontWeight: 900, fontSize: "clamp(2.5rem, 6vw, 4.5rem)", letterSpacing: "-0.04em" }}
              >
                {stat.value}
              </span>

              {/* Divider */}
              <div
                className="w-10 h-1 mb-3"
                style={{ backgroundColor: stat.color }}
              />

              {/* Label */}
              <span
                className="text-[#121212] tracking-widest"
                style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.2em" }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
