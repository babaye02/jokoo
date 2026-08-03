"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { Btn, Card, ErrorBanner } from "../../components/ui";

type Provider = {
  id: string;
  name: string;
  service?: string | null;
  city?: string | null;
  description?: string | null;
  rating?: number;
  reviews_count?: number;
  avatar?: string | null;
  cover_photo?: string | null;
  price_type?: string | null;
  price_amount?: number | null;
  categories?: string[];
  trades?: string[];
  service_mode?: string | null;
  venue?: string | null;
  zones?: string[];
  verified?: boolean;
};

export default function ProviderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [p, setP] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch.get<Provider>(`/providers/${id}`, { auth: false });
        setP(res);
      } catch (e: any) {
        setError(e?.message || "Prestataire introuvable.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="h-48 bg-gray-100 rounded-3xl animate-pulse" />
        <div className="mt-6 h-8 bg-gray-100 rounded animate-pulse w-1/3" />
        <div className="mt-3 h-4 bg-gray-100 rounded animate-pulse w-2/3" />
      </div>
    );
  }

  if (error || !p) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-3">🔎</div>
        <h1 className="text-2xl font-bold text-midnight">Prestataire introuvable</h1>
        <p className="text-gray-500 mt-2">{error || "Ce profil n'existe plus."}</p>
        <div className="mt-6">
          <Btn href="/recherche" variant="primary">
            Retour à la recherche
          </Btn>
        </div>
      </div>
    );
  }

  const rating = p.rating ?? 0;
  const reviews = p.reviews_count ?? 0;
  const priceLabel =
    p.price_type === "quote" || !p.price_amount
      ? "Sur devis"
      : `${p.price_amount.toLocaleString("fr-FR")} FCFA`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden border border-gray-100 bg-white shadow-sm">
        <div className="relative h-52 bg-gradient-to-br from-midnight to-midnight-dark">
          {p.cover_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cover_photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl opacity-30">
              🛠️
            </div>
          )}
          <div className="absolute -bottom-10 left-6">
            <div className="w-20 h-20 rounded-full border-4 border-white bg-turquoise text-white text-2xl font-bold flex items-center justify-center overflow-hidden shadow-md">
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                (p.name?.[0] || "?").toUpperCase()
              )}
            </div>
          </div>
        </div>
        <div className="px-6 pt-14 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-midnight">{p.name}</h1>
              <div className="text-sm text-gray-500 mt-1">
                {p.service || p.trades?.[0] || "Prestataire"} · {p.city || "Sénégal"}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-amber-500">★</span>
                <span className="font-bold text-midnight">
                  {rating > 0 ? rating.toFixed(1) : "—"}
                </span>
                {reviews > 0 ? (
                  <span className="text-gray-400">({reviews} avis)</span>
                ) : null}
                {p.verified ? (
                  <span className="ml-2 bg-turquoise/10 text-turquoise rounded-full px-2 py-0.5 text-[10px] font-bold">
                    ✓ Vérifié
                  </span>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Tarif</div>
              <div className="text-lg font-extrabold text-turquoise">{priceLabel}</div>
            </div>
          </div>

          {p.description ? (
            <p className="mt-6 text-gray-700 whitespace-pre-line leading-relaxed">
              {p.description}
            </p>
          ) : null}

          {p.trades && p.trades.length > 0 ? (
            <div className="mt-6">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Métiers
              </div>
              <div className="flex flex-wrap gap-2">
                {p.trades.map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-gray-100 text-midnight rounded-full px-3 py-1"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {p.zones && p.zones.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Zones d&apos;intervention
              </div>
              <div className="text-sm text-gray-700">{p.zones.join(" · ")}</div>
            </div>
          ) : null}
        </div>
      </div>

      <Card className="mt-6 bg-gradient-to-br from-turquoise/10 to-turquoise/5 border-turquoise/20 text-center">
        <div className="text-3xl mb-2">📱</div>
        <div className="font-bold text-midnight text-lg">
          Réserver ce prestataire
        </div>
        <div className="text-sm text-gray-600 mt-1">
          La réservation, le chat instantané et le paiement sécurisé se font depuis
          l&apos;app mobile Jokoo.
        </div>
        <div className="mt-4 flex justify-center gap-3 flex-wrap">
          <Btn href="/" variant="primary">
            Télécharger l&apos;app
          </Btn>
          <Btn href="/recherche" variant="secondary">
            Autres prestataires
          </Btn>
        </div>
      </Card>
    </div>
  );
}
