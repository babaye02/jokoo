"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth";
import AuthGate from "../../components/AuthGate";
import { apiFetch } from "../../lib/api";
import { Btn, Card } from "../../components/ui";

type Booking = {
  id: string;
  provider_name: string;
  service: string;
  date: string;
  status: string;
  price: number | null;
};

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "bg-amber-100 text-amber-700" },
  accepted: { label: "Acceptée", color: "bg-turquoise/10 text-turquoise" },
  in_progress: { label: "En cours", color: "bg-indigo-100 text-indigo-700" },
  completed: { label: "Terminée", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Annulée", color: "bg-gray-100 text-gray-500" },
  rejected: { label: "Refusée", color: "bg-red-100 text-red-700" },
};

export default function ClientDashboardPage() {
  return (
    <AuthGate requiredRole="client">
      <Content />
    </AuthGate>
  );
}

function Content() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch.get<Booking[]>("/bookings?limit=20")
      .then((r) => setBookings(Array.isArray(r) ? r : []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-sm text-gray-500">Bonjour,</p>
          <h1 className="text-3xl font-extrabold text-midnight">{user?.name} 👋</h1>
          <div className="inline-flex items-center gap-1 mt-2 bg-turquoise/10 text-turquoise text-xs font-bold uppercase px-2.5 py-1 rounded-full">
            Client
          </div>
        </div>
        <div className="flex gap-2">
          <Btn href="/recherche" variant="primary">Trouver un prestataire</Btn>
          <Btn href="/compte" variant="secondary">Mon profil</Btn>
        </div>
      </header>

      <section>
        <h2 className="text-xl font-bold text-midnight mb-4">Mes réservations récentes</h2>
        {loading ? (
          <Card><p className="text-sm text-gray-500">Chargement…</p></Card>
        ) : bookings.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">Aucune réservation pour le moment.</p>
              <Btn href="/recherche">Rechercher un prestataire</Btn>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <Card key={b.id} className="!p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-midnight truncate">{b.provider_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {b.service} · {b.date}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS[b.status]?.color || "bg-gray-100 text-gray-500"}`}>
                      {STATUS[b.status]?.label || b.status}
                    </span>
                    {b.price ? (
                      <div className="text-sm font-bold text-midnight mt-1">
                        {b.price.toLocaleString("fr-FR")} F
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 grid md:grid-cols-3 gap-4">
        <QuickLink href="/recherche" title="Rechercher" desc="Parcourir tous les métiers" />
        <QuickLink href="/compte" title="Mes favoris" desc="Retrouvez vos prestataires favoris" />
        <QuickLink href="/devenir-prestataire" title="Devenir prestataire" desc="Proposez vos services sur Jokoo" />
      </section>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="hover:border-turquoise transition cursor-pointer">
        <div className="font-bold text-midnight">{title}</div>
        <div className="text-xs text-gray-500 mt-1">{desc}</div>
      </Card>
    </Link>
  );
}
