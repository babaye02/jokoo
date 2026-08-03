"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { Btn, Card } from "../../components/ui";

export default function BookingPaidPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <PaidInner />
    </Suspense>
  );
}

function PaidInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const sessionId = sp.get("session_id");
  const bookingId = sp.get("booking_id");
  const kind = sp.get("kind"); // "sub" | undefined

  const [status, setStatus] = useState<"checking" | "paid" | "pending" | "error">(
    "checking"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setError("Aucun identifiant de session Stripe.");
      return;
    }
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const r = await apiFetch.get<{ paid: boolean; status: string }>(
          `/payments/status/${sessionId}`,
          { auth: false }
        );
        if (r.paid) {
          setStatus("paid");
          return;
        }
        if (attempts < 6) {
          setTimeout(poll, 1500);
        } else {
          setStatus("pending");
        }
      } catch (e: any) {
        setError(e?.message || "Impossible de vérifier le paiement.");
        setStatus("error");
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const goDashboard = () => {
    router.push(kind === "sub" ? "/dashboard/prestataire" : "/dashboard/client");
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <Card className="text-center py-12">
        {status === "checking" ? (
          <>
            <div className="w-14 h-14 mx-auto rounded-full border-4 border-turquoise border-t-transparent animate-spin" />
            <h1 className="mt-6 text-2xl font-extrabold text-midnight">
              Vérification du paiement…
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Nous confirmons votre transaction avec Stripe. Cela prend quelques secondes.
            </p>
          </>
        ) : status === "paid" ? (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-midnight">
              Paiement confirmé
            </h1>
            <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
              {kind === "sub"
                ? "Votre abonnement prestataire est activé pour 30 jours."
                : "Votre réservation est confirmée. Le prestataire va vous répondre rapidement."}
            </p>
            <div className="mt-6 flex justify-center gap-3 flex-wrap">
              <Btn onClick={goDashboard} variant="primary">
                Voir mon tableau de bord
              </Btn>
              <Btn href="/recherche" variant="secondary">
                Continuer à explorer
              </Btn>
            </div>
          </>
        ) : status === "pending" ? (
          <>
            <div className="text-6xl mb-4">⏳</div>
            <h1 className="text-2xl font-extrabold text-midnight">
              Paiement en cours de validation
            </h1>
            <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
              Stripe traite votre transaction. Vous recevrez une confirmation par email
              dès qu&apos;elle sera validée.
            </p>
            <div className="mt-6 flex justify-center gap-3 flex-wrap">
              <Btn onClick={goDashboard} variant="primary">
                Voir mon tableau de bord
              </Btn>
            </div>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-extrabold text-midnight">
              Un problème est survenu
            </h1>
            <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
              {error || "Impossible de vérifier votre paiement pour le moment."}
            </p>
            <div className="mt-6 flex justify-center gap-3 flex-wrap">
              <Btn onClick={goDashboard} variant="primary">
                Voir mon tableau de bord
              </Btn>
              <Btn href="/contact" variant="secondary">
                Contacter le support
              </Btn>
            </div>
          </>
        )}

        {bookingId ? (
          <div className="mt-8 text-[11px] text-gray-400">
            Référence : {bookingId.slice(0, 8)}
          </div>
        ) : null}
      </Card>

      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-gray-500 hover:text-turquoise">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
