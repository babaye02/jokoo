import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LEGAL_DOCS_BUNDLE } from "../content";

type LegalDoc = {
  slug: string;
  title: string;
  summary?: string;
  content: string;
  category: string;
  version: number;
  effective_date: string;
  updated_at: string;
  requires_acceptance: boolean;
};

// Content is bundled statically — the page is fully cacheable on Vercel Edge
// and never re-fetches the (possibly outdated) production backend.
export const dynamic = "force-static";
export const revalidate = false;

function findDoc(slug: string): LegalDoc | null {
  const d = LEGAL_DOCS_BUNDLE.find((x) => x.slug === slug && x.published);
  if (!d) return null;
  return {
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    content: d.content,
    category: d.category,
    version: d.version,
    effective_date: d.effective_date,
    updated_at: d.updated_at,
    requires_acceptance: d.requires_acceptance,
  };
}

export function generateStaticParams() {
  return LEGAL_DOCS_BUNDLE.filter((d) => d.published).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = findDoc(slug);
  if (!doc) return { title: `Document juridique · Jokoo` };
  return {
    title: `${doc.title} · Jokoo`,
    description: doc.summary || `${doc.title} — Document juridique de Jokoo, version ${doc.version}.`,
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = findDoc(slug);
  if (!doc) notFound();

  return (
    <article className="bg-white">
      <div className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-14">
        <div className="max-w-3xl mx-auto px-6">
          <Link
            href="/legal"
            className="inline-flex items-center gap-2 text-white/70 hover:text-turquoise text-sm mb-6 transition"
          >
            ← Retour au centre juridique
          </Link>
          <h1 className="text-3xl md:text-5xl font-black leading-tight">{doc.title}</h1>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/70">
            <span>Version {doc.version}</span>
            <span>·</span>
            <span>Effectif le {new Date(doc.effective_date).toLocaleDateString("fr-FR")}</span>
            {doc.requires_acceptance && (
              <>
                <span>·</span>
                <span className="text-turquoise font-bold">Acceptation requise à l'inscription</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-14 prose prose-lg">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-24">
        <div className="p-6 rounded-3xl bg-gray-50 border border-gray-100 text-sm text-gray-600">
          <div className="font-bold text-midnight mb-2">Une question sur ce document ?</div>
          <div>
            Contactez notre équipe juridique à{" "}
            <a href="mailto:legal@jokooservices.com" className="text-turquoise font-bold">
              legal@jokooservices.com
            </a>{" "}
            ou consultez notre{" "}
            <Link href="/contact" className="text-turquoise font-bold">
              page contact
            </Link>
            .
          </div>
        </div>
      </div>
    </article>
  );
}
