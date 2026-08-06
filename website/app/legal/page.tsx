import type { Metadata } from "next";
import { apiSafe } from "../lib/api-server";
import { LegalCenterClient } from "./LegalCenterClient";

export const metadata: Metadata = {
  title: "Centre juridique — CGU, Confidentialité, Cookies · Jokoo",
  description:
    "Retrouvez tous les documents juridiques de Jokoo : conditions générales, politique de confidentialité, cookies, remboursement, sécurité et charte communautaire. Recherche instantanée.",
};

type LegalDoc = {
  slug: string;
  title: string;
  summary?: string;
  category: string;
  version: number;
  effective_date: string;
  requires_acceptance: boolean;
};

// Legal content evolves without redeploys. Never cache the SSR result.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LegalIndex() {
  // apiSafe returns [] on any error → the client component's fallback
  // hydrator will then refetch from the browser using the Vercel rewrite
  // (`/api/*`) that reliably reaches the backend from the user's session.
  const docs = await apiSafe<LegalDoc[]>("/legal/documents", []);

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
