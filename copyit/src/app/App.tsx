import { Navigation } from "./components/Navigation";
import { Hero } from "./components/Hero";
import { Stats } from "./components/Stats";
import { Features } from "./components/Features";
import { HowItWorks } from "./components/HowItWorks";
import { Pricing } from "./components/Pricing";
import { Testimonials } from "./components/Testimonials";
import { FAQ } from "./components/FAQ";
import { Blog } from "./components/Blog";
import { CTA } from "./components/CTA";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <div
      className="min-h-screen bg-[#F0F0F0]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <Navigation />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <FAQ />
      <Blog />
      <CTA />
      <Footer />
    </div>
  );
}
