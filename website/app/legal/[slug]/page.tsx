import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, apiSafe } from "../../lib/api-server";
import { LegalDocClientFallback } from "./LegalDocClientFallback";

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

type LegalDocMeta = Omit<LegalDoc, "content">;

// Legal content evolves without redeploys. Never cache the SSR result.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getDoc(slug: string): Promise<LegalDoc | null> {
  try {
    return await api<LegalDoc>(`/legal/documents/${slug}`);
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  // Empty at build time — pages are dynamic. Slug is validated at request time.
  return [] as { slug: string }[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) return { title: `Document juridique · Jokoo` };
  return {
    title: `${doc.title} · Jokoo`,
    description: doc.summary || `${doc.title} — Document juridique de Jokoo, version ${doc.version}.`,
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Try the authenticated endpoint first (returns everything including content).
  // If it fails on Vercel SSR, we still render the shell and let the client
  // component refetch from the browser via the Vercel rewrite.
  const doc = await apiSafe<LegalDoc | null>(`/legal/documents/${slug}`, null);

  const title = doc?.title || "Document juridique";

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
          <h1 className="text-3xl md:text-5xl font-black leading-tight">{title}</h1>
          {doc && (
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
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-14 prose prose-lg">
        {doc && doc.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
        ) : (
          // Client-side hydrator: refetch and render Markdown if SSR came back empty.
          <LegalDocClientFallback slug={slug} />
        )}
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
