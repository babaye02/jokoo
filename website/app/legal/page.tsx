import type { Metadata } from "next";
import Link from "next/link";
import { api } from "../lib/api";

export const metadata: Metadata = {
  title: "Centre juridique — CGU, Confidentialité, Cookies · Jokoo",
  description:
    "Retrouvez tous les documents juridiques de Jokoo : conditions générales, politique de confidentialité, cookies, remboursement, sécurité et charte communautaire.",
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

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  conditions: { label: "Conditions & Politiques", icon: "📜" },
  paiements: { label: "Paiements & Remboursements", icon: "💳" },
  securite: { label: "Sécurité & Protection", icon: "🛡️" },
  communaute: { label: "Communauté & Modération", icon: "🤝" },
  aide: { label: "Aide & Support", icon: "💬" },
};

export const revalidate = 300;

export default async function LegalIndex() {
  let docs: LegalDoc[] = [];
  try {
    docs = await api<LegalDoc[]>("/legal/documents");
  } catch (e) {
    docs = [];
  }
  const byCat = docs.reduce<Record<string, LegalDoc[]>>((acc, d) => {
    (acc[d.category] ||= []).push(d);
    return acc;
  }, {});

  return (
    <>
      <section className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-turquoise/20 border border-turquoise/30 text-turquoise px-4 py-2 rounded-full text-sm font-bold mb-6">
            ⚖️ Centre juridique
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Transparence & <span className="text-turquoise">confiance</span>.
          </h1>
          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            Tous les documents juridiques de Jokoo — clairs, versionnés et accessibles à tous.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          {docs.length === 0 && (
            <div className="text-center text-gray-500 py-10">Aucun document disponible pour le moment.</div>
          )}
          {Object.keys(CATEGORY_LABELS).map((catKey) => {
            const items = byCat[catKey];
            if (!items || items.length === 0) return null;
            const cat = CATEGORY_LABELS[catKey];
            return (
              <div key={catKey} className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">{cat.icon}</div>
                  <h2 className="text-2xl font-black text-midnight">{cat.label}</h2>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {items.map((d) => (
                    <Link key={d.slug} href={`/legal/${d.slug}`} className="group p-5 rounded-2xl border border-gray-100 hover:border-turquoise hover:shadow-md transition bg-white flex items-start justify-between gap-4">
                      <div>
                        <div className="font-bold text-midnight group-hover:text-turquoise transition">{d.title}</div>
                        <div className="text-xs text-gray-500 mt-1">Version {d.version} · {new Date(d.effective_date).toLocaleDateString("fr-FR")}</div>
                        {d.requires_acceptance && (
                          <div className="mt-2 inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-turquoise/10 text-turquoise">Acceptation requise</div>
                        )}
                      </div>
                      <div className="text-turquoise text-xl group-hover:translate-x-1 transition">→</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
