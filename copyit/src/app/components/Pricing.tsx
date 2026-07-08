import { Check } from "lucide-react";

const plans = [
  {
    name: "BASIC",
    price: "$0",
    period: "FOREVER",
    description: "For individuals exploring geometric composition.",
    features: [
      "3 active compositions",
      "Core shape library",
      "Export to SVG",
      "Bauhaus color palette",
      "Community access",
    ],
    cta: "START FREE",
    ctaStyle: "outline",
    elevated: false,
    accentColor: "#1040C0",
  },
  {
    name: "PRO",
    price: "$29",
    period: "PER MONTH",
    description: "For serious designers who think in geometry.",
    features: [
      "Unlimited compositions",
      "Full shape & grid library",
      "Export SVG + CSS tokens",
      "Custom color palette",
      "Priority support",
      "Version history",
    ],
    cta: "START BUILDING",
    ctaStyle: "yellow",
    elevated: true,
    accentColor: "#D02020",
  },
  {
    name: "STUDIO",
    price: "$89",
    period: "PER MONTH",
    description: "For teams architecting entire design systems.",
    features: [
      "Everything in Pro",
      "Team collaboration",
      "Design token export",
      "Custom brand palette",
      "Dedicated onboarding",
      "SLA guarantee",
    ],
    cta: "CONTACT STUDIO",
    ctaStyle: "dark",
    elevated: false,
    accentColor: "#F0C020",
  },
];

export function Pricing() {
  return (
    <section
      className="py-16 md:py-24 px-4 md:px-8 border-b-4 border-[#121212] bg-[#F0F0F0]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-[#D02020]" />
            <span
              className="text-[#121212] tracking-widest uppercase"
              style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
            >
              PRICING
            </span>
          </div>
          <h2
            className="text-[#121212] leading-none"
            style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(2rem, 5vw, 4rem)" }}
          >
            CHOOSE YOUR{" "}
            <span className="text-[#1040C0]">WORKSHOP</span>
          </h2>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={`relative border-4 border-[#121212] bg-white transition-transform duration-200 hover:-translate-y-1 ${
                plan.elevated ? "md:-translate-y-4 shadow-[12px_12px_0px_0px_#121212]" : "shadow-[8px_8px_0px_0px_#121212]"
              }`}
            >
              {/* Top accent bar */}
              <div
                className="h-2 w-full"
                style={{ backgroundColor: plan.accentColor }}
              />

              {/* Popular badge */}
              {plan.elevated && (
                <div
                  className="absolute -top-5 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#D02020] border-2 border-[#121212] text-white"
                  style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.15em" }}
                >
                  MOST POPULAR
                </div>
              )}

              <div className="p-8">
                {/* Plan name */}
                <div className="flex items-center justify-between mb-6">
                  <span
                    className="text-[#121212] tracking-widest"
                    style={{ fontWeight: 900, fontSize: "0.8rem", letterSpacing: "0.15em" }}
                  >
                    {plan.name}
                  </span>
                  <div
                    className="w-6 h-6"
                    style={{
                      backgroundColor: plan.accentColor,
                      borderRadius: i === 1 ? "50%" : "0",
                      transform: i === 2 ? "rotate(45deg)" : "none",
                    }}
                  />
                </div>

                {/* Price */}
                <div className="mb-2">
                  <span
                    className="text-[#121212]"
                    style={{ fontWeight: 900, fontSize: "3.5rem", lineHeight: 1, letterSpacing: "-0.04em" }}
                  >
                    {plan.price}
                  </span>
                </div>
                <p
                  className="text-[#717182] mb-4 tracking-widest"
                  style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.15em" }}
                >
                  {plan.period}
                </p>
                <p
                  className="text-[#121212] mb-8 border-b-2 border-[#E0E0E0] pb-8"
                  style={{ fontWeight: 500, fontSize: "0.875rem", lineHeight: "1.6" }}
                >
                  {plan.description}
                </p>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border-2 border-[#121212]"
                        style={{ backgroundColor: plan.accentColor }}
                      >
                        <Check
                          size={11}
                          strokeWidth={3}
                          color={plan.accentColor === "#F0C020" ? "#121212" : "white"}
                        />
                      </div>
                      <span
                        className="text-[#121212]"
                        style={{ fontWeight: 500, fontSize: "0.875rem" }}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <a
                  href="#"
                  className={`flex items-center justify-center w-full py-4 border-2 border-[#121212] transition-all duration-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
                    plan.ctaStyle === "yellow"
                      ? "bg-[#F0C020] text-[#121212] shadow-[4px_4px_0px_0px_#121212] hover:bg-[#F0C020]/90"
                      : plan.ctaStyle === "dark"
                      ? "bg-[#121212] text-white shadow-[4px_4px_0px_0px_#D02020] hover:bg-[#121212]/90"
                      : "bg-white text-[#121212] shadow-[4px_4px_0px_0px_#121212] hover:bg-[#F0F0F0]"
                  }`}
                  style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.12em" }}
                >
                  {plan.cta}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
