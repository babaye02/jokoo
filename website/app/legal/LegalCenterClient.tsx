"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Client-side fallback: try multiple endpoints so that even if SSR returned
// an empty array (Vercel Data Cache glitch, self-fetch loop, cold start…),
// the user still sees content within milliseconds after hydration.
async function fetchLegalDocsFromBrowser(): Promise<LegalDoc[]> {
  const candidates = [
    "/api/legal/documents?language=fr&country=SN",
    "/api/public/legal?language=fr&country=SN",
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!r.ok) continue;
      const data: unknown = await r.json();
      if (Array.isArray(data) && data.length > 0) return data as LegalDoc[];
      if (
        data &&
        typeof data === "object" &&
        "documents" in data &&
        Array.isArray((data as { documents: unknown }).documents)
      ) {
        const docs = (data as { documents: LegalDoc[] }).documents;
        if (docs.length > 0) return docs;
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

export function LegalCenterClient({ initialDocs }: { initialDocs: LegalDoc[] }) {
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<LegalDoc[]>(initialDocs || []);
  const [hydrating, setHydrating] = useState(false);

  // If SSR returned no documents (backend hiccup, cache miss, self-fetch loop),
  // refetch from the browser using the same-origin Vercel rewrite. This is the
  // resilience net that guarantees the page NEVER stays empty when the backend
  // is reachable from the client.
  useEffect(() => {
    if (docs.length > 0) return;
    let cancelled = false;
    setHydrating(true);
    fetchLegalDocsFromBrowser()
      .then((fresh) => {
        if (!cancelled && fresh.length > 0) setDocs(fresh);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally only run once on mount when we start empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const query = normalize(q.trim());
    if (!query) return docs;
    return docs.filter((d) => {
      return (
        normalize(d.title).includes(query) ||
        normalize(d.summary || "").includes(query) ||
        normalize(d.category).includes(query)
      );
    });
  }, [q, docs]);

  const byCat = useMemo(() => {
    return filtered.reduce<Record<string, LegalDoc[]>>((acc, d) => {
      (acc[d.category] ||= []).push(d);
      return acc;
    }, {});
  }, [filtered]);

  return (
    <div>
      {/* Search box */}
      <div className="max-w-2xl mx-auto mb-10 -mt-16 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2 flex items-center gap-2">
          <div className="pl-3 text-gray-400 text-xl">🔍</div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un document (CGU, remboursement, cookies, sécurité…)"
            aria-label="Rechercher un document juridique"
            data-testid="legal-search-input"
            className="flex-1 px-2 py-3 text-base bg-transparent outline-none text-midnight placeholder:text-gray-400"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Effacer la recherche"
              className="px-3 py-2 text-sm text-gray-500 hover:text-midnight"
            >
              ✕
            </button>
          )}
        </div>
        {q && (
          <div className="mt-3 text-sm text-gray-500 text-center" data-testid="legal-search-count">
            {filtered.length === 0
              ? "Aucun résultat"
              : filtered.length === 1
              ? "1 document trouvé"
              : `${filtered.length} documents trouvés`}
          </div>
        )}
      </div>

      {/* Empty state (only shows if BOTH SSR and client fetch failed) */}
      {docs.length === 0 && !hydrating && (
        <div className="text-center text-gray-500 py-10">
          <div className="text-5xl mb-3">📄</div>
          <div className="font-medium text-gray-700">
            Nos documents juridiques sont momentanément indisponibles.
          </div>
          <div className="text-sm mt-2 text-gray-500">
            Merci de réessayer dans quelques instants —{" "}
            <button
              onClick={() => {
                setHydrating(true);
                fetchLegalDocsFromBrowser()
                  .then((d) => setDocs(d))
                  .finally(() => setHydrating(false));
              }}
              className="text-turquoise font-bold underline"
            >
              recharger la liste
            </button>
            .
          </div>
        </div>
      )}

      {/* Loading state during client fallback */}
      {docs.length === 0 && hydrating && (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-turquoise/20 border-t-turquoise rounded-full animate-spin mb-4" />
          <div className="text-gray-500">Chargement des documents juridiques…</div>
        </div>
      )}

      {filtered.length === 0 && docs.length > 0 && (
        <div className="text-center py-10">
          <div className="text-5xl mb-3">🔍</div>
          <div className="text-gray-600">Aucun document ne correspond à votre recherche.</div>
          <button onClick={() => setQ("")} className="mt-4 text-turquoise font-bold hover:underline">
            Voir tous les documents
          </button>
        </div>
      )}

      {Object.keys(CATEGORY_LABELS).map((catKey) => {
        const items = byCat[catKey];
        if (!items || items.length === 0) return null;
        const cat = CATEGORY_LABELS[catKey];
        return (
          <div key={catKey} className="mb-12" data-testid={`legal-category-${catKey}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl">{cat.icon}</div>
              <h2 className="text-2xl font-black text-midnight">{cat.label}</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {items.map((d) => (
                <Link
                  key={d.slug}
                  href={`/legal/${d.slug}`}
                  className="group p-5 rounded-2xl border border-gray-100 hover:border-turquoise hover:shadow-md transition bg-white flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-midnight group-hover:text-turquoise transition">{d.title}</div>
                    {d.summary && (
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{d.summary}</div>
                    )}
                    <div className="text-[11px] text-gray-400 mt-2">
                      Version {d.version} · Mis à jour le {new Date(d.effective_date).toLocaleDateString("fr-FR")}
                    </div>
                    {d.requires_acceptance && (
                      <div className="mt-2 inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-turquoise/10 text-turquoise">
                        Acceptation requise
                      </div>
                    )}
                  </div>
                  <div className="text-turquoise text-xl group-hover:translate-x-1 transition">→</div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* Fallback list rendering for docs whose category is not in CATEGORY_LABELS.
          Ensures NO published document is ever hidden. */}
      {(() => {
        const knownCats = new Set(Object.keys(CATEGORY_LABELS));
        const orphans = filtered.filter((d) => !knownCats.has(d.category));
        if (orphans.length === 0) return null;
        return (
          <div className="mb-12" data-testid="legal-category-autres">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl">📎</div>
              <h2 className="text-2xl font-black text-midnight">Autres documents</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {orphans.map((d) => (
                <Link
                  key={d.slug}
                  href={`/legal/${d.slug}`}
                  className="group p-5 rounded-2xl border border-gray-100 hover:border-turquoise hover:shadow-md transition bg-white flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-midnight group-hover:text-turquoise transition">{d.title}</div>
                    {d.summary && (
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{d.summary}</div>
                    )}
                    <div className="text-[11px] text-gray-400 mt-2">
                      Version {d.version} · Mis à jour le {new Date(d.effective_date).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <div className="text-turquoise text-xl group-hover:translate-x-1 transition">→</div>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
