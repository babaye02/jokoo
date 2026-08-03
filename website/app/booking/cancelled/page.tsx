"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn, Card } from "../../components/ui";

export default function BookingCancelledPage() {
  const router = useRouter();
  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <Card className="text-center py-12">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-midnight">
          Paiement annulé
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
          Votre réservation a été enregistrée mais aucun paiement n&apos;a été effectué.
          Vous pouvez la finaliser plus tard depuis votre tableau de bord.
        </p>
        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <Btn onClick={() => router.push("/dashboard/client")} variant="primary">
            Voir mes réservations
          </Btn>
          <Btn href="/recherche" variant="secondary">
            Rechercher un autre prestataire
          </Btn>
        </div>
      </Card>
      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-gray-500 hover:text-turquoise">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
