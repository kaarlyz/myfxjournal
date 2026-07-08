import { ArrowRight } from "lucide-react";

const posts = [
  {
    category: "THEORY",
    title: "WHY THE BAUHAUS STILL DEFINES MODERN UI DESIGN",
    excerpt:
      "One hundred years after its founding, the Bauhaus school's insistence on geometric purity and functional honesty has never been more relevant to the interfaces we build daily.",
    date: "12 JUN 2026",
    readTime: "8 MIN READ",
    imageUrl:
      "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXVoYXVzJTIwZ2VvbWV0cmljJTIwYXJjaGl0ZWN0dXJlJTIwYWJzdHJhY3R8ZW58MXx8fHwxNzgzNDQ2MzkxfDA&ixlib=rb-4.1.0&q=80&w=1080",
    imageRound: false,
    accentColor: "#F0C020",
  },
  {
    category: "PROCESS",
    title: "COMPOSING WITH CONSTRAINTS: THE PRIMARY COLOR MANIFESTO",
    excerpt:
      "What happens when you remove every color except red, blue, and yellow from your design toolkit? Designers who tried it report a radical shift in creative thinking.",
    date: "28 MAY 2026",
    readTime: "6 MIN READ",
    imageUrl:
      "https://images.unsplash.com/photo-1632667680404-572c57873c21?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxiYXVoYXVzJTIwZ2VvbWV0cmljJTIwYXJjaGl0ZWN0dXJlJTIwYWJzdHJhY3R8ZW58MXx8fHwxNzgzNDQ2MzkxfDA&ixlib=rb-4.1.0&q=80&w=1080",
    imageRound: true,
    accentColor: "#D02020",
  },
  {
    category: "TYPOGRAPHY",
    title: "THE GEOMETRY OF LETTERS: BUILDING TYPE SYSTEMS FROM CIRCLES",
    excerpt:
      "Herbert Bayer's Universal Typeface reduced letterforms to their geometric essence. How that experiment maps directly to building design tokens in 2026.",
    date: "10 MAY 2026",
    readTime: "5 MIN READ",
    imageUrl:
      "https://images.unsplash.com/photo-1601570682455-bdd0b87f0cfa?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxiYXVoYXVzJTIwZ2VvbWV0cmljJTIwYXJjaGl0ZWN0dXJlJTIwYWJzdHJhY3R8ZW58MXx8fHwxNzgzNDQ2MzkxfDA&ixlib=rb-4.1.0&q=80&w=1080",
    imageRound: false,
    accentColor: "#1040C0",
  },
];

export function Blog() {
  return (
    <section
      className="py-16 md:py-24 px-4 md:px-8 border-b-4 border-[#121212] bg-[#1040C0]"
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 bg-[#F0C020]" />
              <span
                className="text-[#F0C020] tracking-widest uppercase"
                style={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.2em" }}
              >
                JOURNAL
              </span>
            </div>
            <h2
              className="text-white leading-none"
              style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(2rem, 5vw, 4rem)" }}
            >
              THOUGHTS ON
              <br />
              <span className="text-[#F0C020]">CONSTRUCTION</span>
            </h2>
          </div>
          <a
            href="#"
            className="flex items-center gap-2 self-start md:self-auto text-white border-b-2 border-white hover:text-[#F0C020] hover:border-[#F0C020] transition-colors duration-200"
            style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.1em" }}
          >
            ALL ARTICLES
            <ArrowRight size={14} strokeWidth={2.5} />
          </a>
        </div>

        {/* Articles grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {posts.map((post, i) => (
            <a
              key={post.title}
              href="#"
              className="group block bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.3)] hover:-translate-y-1 transition-transform duration-200"
            >
              {/* Image */}
              <div className="overflow-hidden border-b-4 border-[#121212] relative">
                <img
                  src={post.imageUrl}
                  alt={post.title}
                  className={`w-full h-48 object-cover grayscale group-hover:grayscale-0 transition-all duration-300 ${
                    post.imageRound ? "scale-90 rounded-full" : ""
                  }`}
                />
                {/* Category badge */}
                <div
                  className="absolute top-3 left-3 px-3 py-1 border-2 border-[#121212]"
                  style={{
                    backgroundColor: post.accentColor,
                    fontWeight: 700,
                    fontSize: "0.6rem",
                    letterSpacing: "0.15em",
                    color: post.accentColor === "#F0C020" ? "#121212" : "white",
                  }}
                >
                  {post.category}
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Corner decoration */}
                <div className="flex justify-end mb-3">
                  <div
                    className="w-3 h-3"
                    style={{
                      backgroundColor: post.accentColor,
                      borderRadius: i === 1 ? "50%" : "0",
                      transform: i === 2 ? "rotate(45deg)" : "none",
                    }}
                  />
                </div>

                <h3
                  className="text-[#121212] mb-3 group-hover:text-[#D02020] transition-colors duration-200"
                  style={{ fontWeight: 900, fontSize: "0.95rem", lineHeight: "1.3", letterSpacing: "-0.01em" }}
                >
                  {post.title}
                </h3>
                <p
                  className="text-[#717182] mb-4"
                  style={{ fontWeight: 500, fontSize: "0.85rem", lineHeight: "1.6" }}
                >
                  {post.excerpt}
                </p>

                <div className="flex items-center justify-between border-t-2 border-[#E0E0E0] pt-4">
                  <span
                    className="text-[#717182]"
                    style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.1em" }}
                  >
                    {post.date}
                  </span>
                  <span
                    className="text-[#717182]"
                    style={{ fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.1em" }}
                  >
                    {post.readTime}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
