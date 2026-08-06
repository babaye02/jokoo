import type { Metadata } from "next";
import { LegalCenterClient } from "./LegalCenterClient";
import { LEGAL_DOCS_BUNDLE } from "./content";

export const metadata: Metadata = {
  title: "Centre juridique — CGU, Confidentialité, Cookies · Jokoo",
  description:
    "Retrouvez tous les documents juridiques de Jokoo : conditions générales, politique de confidentialité, cookies, remboursement, sécurité et charte communautaire. Recherche instantanée.",
};

// The legal content is bundled statically so Vercel serves it instantly and
// independently of the backend. This guarantees the public website ALWAYS
// shows the latest published policies as reviewed by the legal team.
export const dynamic = "force-static";
export const revalidate = false;

export default function LegalIndex() {
  const docs = LEGAL_DOCS_BUNDLE.filter((d) => d.published).map((d) => ({
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    category: d.category,
    version: d.version,
    effective_date: d.effective_date,
    requires_acceptance: d.requires_acceptance,
  }));

  return (
    <>
      <section className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-20 pb-28">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-turquoise/20 border border-turquoise/30 text-turquoise px-4 py-2 rounded-full text-sm font-bold mb-6">
            ⚖️ Centre juridique
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Transparence & <span className="text-turquoise">confiance</span>.
          </h1>
          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            Tous les documents juridiques de Jokoo — clairs, versionnés et accessibles à tous. Recherche instantanée.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <LegalCenterClient initialDocs={docs} />
        </div>
      </section>
    </>
  );
}
