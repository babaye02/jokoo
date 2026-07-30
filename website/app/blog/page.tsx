import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "../lib/blog";

export const metadata: Metadata = {
  title: "Blog Jokoo — Conseils, guides et actualités sur les services au Sénégal",
  description:
    "Trouver un plombier, un chauffeur ou une baby-sitter au Sénégal. Nos guides pratiques, tarifs et conseils pour bien choisir vos prestataires.",
};

const CAT_COLORS: Record<string, string> = {
  "Guides": "bg-turquoise/10 text-turquoise",
  "Mobilité": "bg-blue-100 text-blue-700",
  "Family": "bg-pink-100 text-pink-700",
};

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <>
      <section className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-turquoise/20 border border-turquoise/30 text-turquoise px-4 py-2 rounded-full text-sm font-bold mb-6">
            📝 Blog Jokoo
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Conseils, guides & <span className="text-turquoise">actualités</span>.
          </h1>
          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            Tout ce qu'il faut savoir pour trouver les meilleurs services au Sénégal.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          {featured && (
            <Link href={`/blog/${featured.slug}`} className="block group mb-16">
              <div className="grid md:grid-cols-2 gap-8 items-center rounded-3xl overflow-hidden border border-gray-100 hover:border-turquoise transition">
                <div className="aspect-[4/3] bg-gradient-to-br from-turquoise/10 via-turquoise/5 to-midnight/5 flex items-center justify-center text-9xl">
                  {featured.cover}
                </div>
                <div className="p-8">
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`px-3 py-1 rounded-full font-bold ${CAT_COLORS[featured.category] || "bg-gray-100 text-gray-700"}`}>{featured.category}</span>
                    <span className="text-gray-500">{new Date(featured.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
                    <span className="text-gray-500">· {featured.readingTime}</span>
                  </div>
                  <h2 className="mt-4 text-3xl font-black text-midnight group-hover:text-turquoise transition leading-tight">{featured.title}</h2>
                  <p className="mt-3 text-gray-600">{featured.description}</p>
                  <div className="mt-6 text-turquoise font-bold">Lire l'article →</div>
                </div>
              </div>
            </Link>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="group rounded-3xl overflow-hidden border border-gray-100 hover:border-turquoise hover:shadow-md transition bg-white">
                <div className="aspect-[16/9] bg-gradient-to-br from-turquoise/10 to-midnight/10 flex items-center justify-center text-7xl">
                  {p.cover}
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${CAT_COLORS[p.category] || "bg-gray-100 text-gray-700"}`}>{p.category}</span>
                    <span className="text-gray-500">{p.readingTime}</span>
                  </div>
                  <h3 className="mt-3 font-black text-midnight group-hover:text-turquoise transition leading-tight">{p.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 line-clamp-2">{p.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
