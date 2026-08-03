"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../lib/auth";
import { apiFetch } from "../../../lib/api";
import AuthGate from "../../../components/AuthGate";
import { Btn, Card, ErrorBanner, Field, Input, Textarea } from "../../../components/ui";

type Provider = {
  id: string;
  name: string;
  service?: string | null;
  city?: string | null;
  avatar?: string | null;
  price_type?: string | null;
  price_amount?: number | null;
  service_mode?: string | null; // "home" | "venue" | "both"
  venue?: string | null;
};

type BookingCreated = {
  id: string;
  price_type: string;
  price: number | null;
};

export default function ReserverPage() {
  return (
    <AuthGate>
      <ReserverInner />
    </AuthGate>
  );
}

function ReserverInner() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();
  const { user } = useAuth();

  const [p, setP] = useState<Provider | null>(null);
  const [loadingP, setLoadingP] = useState(true);

  // Form state
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [address, setAddress] = useState(user?.city || "");
  const [description, setDescription] = useState("");
  const [payNow, setPayNow] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoadingP(true);
      try {
        const res = await apiFetch.get<Provider>(`/providers/${id}`, { auth: false });
        setP(res);
        // Pré-remplir adresse si mode "venue" (client vient chez le prestataire)
        if (res.service_mode === "venue" && res.venue) {
          setAddress(res.venue);
        }
      } catch (e: any) {
        setError(e?.message || "Prestataire introuvable.");
      } finally {
        setLoadingP(false);
      }
    })();
  }, [id]);

  const priceLabel =
    p?.price_type === "quote" || !p?.price_amount
      ? "Sur devis"
      : `${p.price_amount.toLocaleString("fr-FR")} FCFA`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!date || !time) {
      setError("Date et heure requises.");
      return;
    }
    if (address.trim().length < 3) {
      setError("Adresse d'intervention requise (au moins 3 caractères).");
      return;
    }
    if (description.trim().length < 5) {
      setError("Décrivez votre besoin en quelques mots (5 caractères minimum).");
      return;
    }

    setSubmitting(true);
    try {
      const booking = await apiFetch.post<BookingCreated>("/bookings", {
        provider_id: id,
        date,
        time,
        address: address.trim(),
        description: description.trim(),
      });

      // Si tarif fixe/from et paiement immédiat souhaité → checkout Stripe
      const canPayNow =
        payNow && booking.price_type !== "quote" && booking.price && booking.price > 0;

      if (canPayNow) {
        const checkout = await apiFetch.post<{ url: string; session_id: string }>(
          "/payments/checkout/booking",
          { booking_id: booking.id, amount_xof: booking.price }
        );
        if (checkout.url) {
          window.location.href = checkout.url;
          return;
        }
      }

      // Sinon → redirection vers dashboard client
      router.push("/dashboard/client?created=" + encodeURIComponent(booking.id));
    } catch (e: any) {
      setError(e?.message || "Réservation impossible.");
      setSubmitting(false);
    }
  };

  if (loadingP) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-1/3" />
        <div className="mt-4 h-40 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-3">🔎</div>
        <h1 className="text-2xl font-bold text-midnight">Prestataire introuvable</h1>
        <div className="mt-6">
          <Btn href="/recherche">Retour à la recherche</Btn>
        </div>
      </div>
    );
  }

  const isQuote = p.price_type === "quote" || !p.price_amount;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Link
          href={`/prestataires/${p.id}`}
          className="text-sm text-turquoise hover:underline"
        >
          ← Retour au profil
        </Link>
      </div>

      <h1 className="text-3xl md:text-4xl font-extrabold text-midnight">
        Réserver {p.name}
      </h1>

      {/* Provider summary */}
      <Card className="mt-6">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-turquoise text-white text-lg font-bold flex items-center justify-center overflow-hidden">
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              (p.name?.[0] || "?").toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-midnight truncate">{p.name}</div>
            <div className="text-xs text-gray-500 truncate">
              {p.service || "Prestataire"} · {p.city || "Sénégal"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Tarif</div>
            <div className="font-extrabold text-turquoise">{priceLabel}</div>
          </div>
        </div>
      </Card>

      {/* Booking form */}
      <Card className="mt-6">
        <h2 className="font-bold text-midnight text-lg mb-4">
          Vos informations de réservation
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Date souhaitée">
              <Input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                required
                data-testid="booking-date"
              />
            </Field>
            <Field label="Heure">
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                data-testid="booking-time"
              />
            </Field>
          </div>
          <Field
            label={
              p.service_mode === "venue"
                ? "Lieu d'intervention (chez le prestataire)"
                : "Adresse d'intervention"
            }
            hint={
              p.service_mode === "venue"
                ? "Le prestataire vous recevra à cette adresse."
                : "Où le prestataire doit-il intervenir ?"
            }
          >
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex. Sacré-Cœur 3, Villa 12, Dakar"
              required
              data-testid="booking-address"
            />
          </Field>
          <Field
            label="Décrivez votre besoin"
            hint="Plus vous êtes précis, meilleure sera la prise en charge."
          >
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. Fuite d'eau sous l'évier de la cuisine, besoin urgent…"
              required
              data-testid="booking-description"
            />
          </Field>

          {!isQuote ? (
            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-turquoise cursor-pointer">
              <input
                type="checkbox"
                checked={payNow}
                onChange={(e) => setPayNow(e.target.checked)}
                className="mt-0.5 accent-turquoise"
                data-testid="booking-paynow"
              />
              <div className="flex-1">
                <div className="font-semibold text-midnight text-sm">
                  Payer maintenant par carte
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Paiement sécurisé Stripe — {priceLabel}. Vous serez redirigé après validation.
                </div>
              </div>
            </label>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              💡 Ce prestataire fonctionne <b>sur devis</b>. Vous recevrez une proposition
              tarifaire dans le tableau de bord après validation de la demande.
            </div>
          )}

          {error ? <ErrorBanner message={error} /> : null}

          <div className="flex gap-3 flex-wrap">
            <Btn
              type="submit"
              size="lg"
              disabled={submitting}
              data-testid="booking-submit"
            >
              {submitting
                ? "Envoi…"
                : !isQuote && payNow
                ? "Réserver & payer"
                : "Envoyer la demande"}
            </Btn>
            <Btn
              href={`/prestataires/${p.id}`}
              variant="secondary"
              size="lg"
              type="button"
            >
              Annuler
            </Btn>
          </div>
        </form>
      </Card>

      <div className="mt-6 text-center text-xs text-gray-400">
        <Link href="/legal" className="hover:underline">CGU</Link>
        {" · "}
        <Link href="/legal" className="hover:underline">Politique de remboursement</Link>
      </div>
    </div>
  );
}
