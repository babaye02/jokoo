"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Btn, Card, Field, Input, ErrorBanner } from "../components/ui";

type ProviderCard = {
  id: string;
  name: string;
  service?: string | null;
  city?: string | null;
  rating?: number;
  reviews_count?: number;
  avatar?: string | null;
  cover_photo?: string | null;
  price_type?: string | null;
  price_amount?: number | null;
  description?: string | null;
  categories?: string[];
  trades?: string[];
  verified?: boolean;
};

export default function RecherchePage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <RechercheInner />
    </Suspense>
  );
}

function RechercheInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [city, setCity] = useState(sp.get("city") || "");
  const [items, setItems] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (query: string, cityFilter: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (cityFilter.trim()) params.set("city", cityFilter.trim());
      params.set("limit", "60");
      params.set("sort", "rating");
      const res = await apiFetch.get<ProviderCard[]>(
        `/providers?${params.toString()}`,
        { auth: false }
      );
      setItems(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les prestataires.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(sp.get("q") || "", sp.get("city") || "");
  }, [load, sp]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (city.trim()) params.set("city", city.trim());
    router.push(`/recherche${params.toString() ? "?" + params.toString() : ""}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-midnight">
          Trouver un prestataire
        </h1>
        <p className="text-gray-600 mt-2">
          Découvrez des professionnels vérifiés partout au Sénégal.
        </p>
      </div>

      <Card className="mb-8">
        <form onSubmit={submit} className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
          <Field label="Recherche">
            <Input
              placeholder="Plombier, coiffeur, tresses, ménage…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="search-q"
            />
          </Field>
          <Field label="Ville / Zone">
            <Input
              placeholder="Dakar, Thiès, Saint-Louis…"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              data-testid="search-city"
            />
          </Field>
          <div className="flex items-end">
            <Btn type="submit" size="lg" fullWidth data-testid="search-submit">
              Rechercher
            </Btn>
          </div>
        </form>
      </Card>

      {error ? <ErrorBanner message={error} /> : null}

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-56 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-5xl mb-3">🔍</div>
          <div className="text-lg font-bold text-midnight mb-1">
            Aucun prestataire trouvé
          </div>
          <div className="text-sm text-gray-500 mb-6">
            Essayez d&apos;élargir votre recherche ou de changer de ville.
          </div>
          <Btn href="/recherche" variant="secondary">
            Voir tous les prestataires
          </Btn>
        </Card>
      ) : (
        <>
          <div className="text-sm text-gray-500 mb-4">
            {items.length} prestataire{items.length > 1 ? "s" : ""} trouvé
            {items.length > 1 ? "s" : ""}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((p) => (
              <ProviderCardView key={p.id} p={p} />
            ))}
          </div>
        </>
      )}

      <div className="mt-12 rounded-3xl bg-gradient-to-br from-turquoise/10 to-turquoise/5 border border-turquoise/20 p-8 text-center">
        <div className="text-3xl mb-2">📱</div>
        <div className="font-bold text-midnight text-lg">
          Envie de réserver directement ?
        </div>
        <div className="text-sm text-gray-600 mt-1">
          L&apos;application mobile Jokoo offre chat instantané, notifications et
          paiement sécurisé.
        </div>
        <div className="mt-4 flex justify-center gap-3 flex-wrap">
          <Btn href="/" variant="primary">
            Télécharger l&apos;app
          </Btn>
          <Btn href="/comment-ca-marche" variant="secondary">
            Comment ça marche
          </Btn>
        </div>
      </div>
    </div>
  );
}

function ProviderCardView({ p }: { p: ProviderCard }) {
  const rating = p.rating ?? 0;
  const reviews = p.reviews_count ?? 0;
  const priceLabel =
    p.price_type === "quote" || !p.price_amount
      ? "Sur devis"
      : `${p.price_amount.toLocaleString("fr-FR")} FCFA`;
  return (
    <Link
      href={`/prestataires/${p.id}`}
      className="group block bg-white rounded-2xl border border-gray-100 hover:border-turquoise hover:shadow-lg transition overflow-hidden"
      data-testid={`provider-card-${p.id}`}
    >
      <div className="h-28 bg-gradient-to-br from-midnight to-midnight-dark relative">
        {p.cover_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.cover_photo}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">
            🛠️
          </div>
        )}
        <div className="absolute -bottom-6 left-4">
          <div className="w-14 h-14 rounded-full border-4 border-white bg-turquoise text-white text-lg font-bold flex items-center justify-center overflow-hidden">
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              (p.name?.[0] || "?").toUpperCase()
            )}
          </div>
        </div>
        {p.verified ? (
          <div className="absolute top-2 right-2 bg-white/95 rounded-full px-2 py-0.5 text-[10px] font-bold text-turquoise">
            ✓ Vérifié
          </div>
        ) : null}
      </div>
      <div className="p-4 pt-8">
        <div className="font-bold text-midnight text-base leading-tight truncate">
          {p.name || "Prestataire"}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">
          {p.service || p.trades?.[0] || "Service"} · {p.city || "Sénégal"}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-amber-500">★</span>
            <span className="font-bold text-midnight">
              {rating > 0 ? rating.toFixed(1) : "—"}
            </span>
            {reviews > 0 ? (
              <span className="text-xs text-gray-400">({reviews})</span>
            ) : null}
          </div>
          <div className="text-xs font-bold text-turquoise bg-turquoise/10 px-2 py-1 rounded-full">
            {priceLabel}
          </div>
        </div>
      </div>
    </Link>
  );
}
