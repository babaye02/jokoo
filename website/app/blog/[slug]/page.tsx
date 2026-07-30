import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { POSTS, getPost } from "../../lib/blog";

export async function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) return { title: "Article introuvable" };
  return {
    title: `${p.title} · Blog Jokoo`,
    description: p.description,
    openGraph: {
      title: p.title,
      description: p.description,
      type: "article",
      publishedTime: p.date,
    },
  };
}

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const others = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <>
      <article className="bg-white">
        <div className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-14">
          <div className="max-w-3xl mx-auto px-6">
            <Link href="/blog" className="inline-flex items-center gap-2 text-white/70 hover:text-turquoise text-sm mb-6 transition">
              ← Retour au blog
            </Link>
            <div className="flex items-center gap-3 text-xs">
              <span className="px-3 py-1 rounded-full font-bold bg-turquoise/20 text-turquoise">{post.category}</span>
              <span className="text-white/60">{new Date(post.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
              <span className="text-white/60">· {post.readingTime}</span>
            </div>
            <h1 className="mt-5 text-3xl md:text-5xl font-black leading-tight">{post.title}</h1>
            <p className="mt-4 text-white/80 text-lg">{post.description}</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-14">
          <div className="aspect-[16/8] rounded-3xl bg-gradient-to-br from-turquoise/10 to-midnight/10 flex items-center justify-center text-9xl mb-10">
            {post.cover}
          </div>
          <div className="prose prose-lg">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
          </div>
        </div>

        {others.length > 0 && (
          <div className="max-w-5xl mx-auto px-6 pb-24">
            <div className="border-t border-gray-100 pt-12">
              <h2 className="text-2xl font-black text-midnight mb-8">Continuez à lire</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {others.map((p) => (
                  <Link key={p.slug} href={`/blog/${p.slug}`} className="group rounded-3xl overflow-hidden border border-gray-100 hover:border-turquoise hover:shadow-md transition bg-white">
                    <div className="aspect-[16/9] bg-gradient-to-br from-turquoise/10 to-midnight/10 flex items-center justify-center text-7xl">{p.cover}</div>
                    <div className="p-5">
                      <h3 className="font-black text-midnight group-hover:text-turquoise transition">{p.title}</h3>
                      <div className="mt-2 text-sm text-gray-500">{p.readingTime}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </article>
    </>
  );
}
