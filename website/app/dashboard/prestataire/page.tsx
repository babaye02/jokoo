"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth";
import AuthGate from "../../components/AuthGate";
import { apiFetch } from "../../lib/api";
import { Btn, Card } from "../../components/ui";

type Booking = {
  id: string;
  client_name: string;
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

export default function ProviderDashboardPage() {
  return (
    <AuthGate requiredRole="prestataire">
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

  const pending = bookings.filter((b) => b.status === "pending").length;
  const totalRevenue = bookings
    .filter((b) => b.status === "completed" && b.price)
    .reduce((sum, b) => sum + (b.price || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-sm text-gray-500">Bonjour,</p>
          <h1 className="text-3xl font-extrabold text-midnight">{user?.name} 👋</h1>
          <div className="inline-flex items-center gap-1 mt-2 bg-amber-100 text-amber-700 text-xs font-bold uppercase px-2.5 py-1 rounded-full">
            Prestataire
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn href="/compte/profil-pro" variant="primary">Éditer mon profil</Btn>
          <Btn href="/compte/prestations" variant="secondary">Mes prestations</Btn>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Demandes en attente" value={pending} accent="text-amber-600" />
        <StatCard label="Revenus totaux" value={`${totalRevenue.toLocaleString("fr-FR")} F`} accent="text-turquoise" />
        <StatCard label="Réservations" value={bookings.length} />
        <StatCard label="Réservations terminées" value={bookings.filter(b => b.status === "completed").length} accent="text-emerald-600" />
      </section>

      <section>
        <h2 className="text-xl font-bold text-midnight mb-4">Demandes récentes</h2>
        {loading ? (
          <Card><p className="text-sm text-gray-500">Chargement…</p></Card>
        ) : bookings.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">Aucune demande pour le moment.</p>
              <Btn href="/compte/profil-pro">Compléter mon profil</Btn>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <Card key={b.id} className="!p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-midnight truncate">{b.client_name}</div>
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
        <QuickLink href="/compte/profil-pro" title="Mon profil pro" desc="Catégories, métiers, photos" />
        <QuickLink href="/compte/disponibilites" title="Disponibilités" desc="Vos horaires et absences" />
        <QuickLink href="/compte/prestations" title="Prestations & prix" desc="Le détail de vos services" />
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Card className="!p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${accent || "text-midnight"}`}>{value}</div>
    </Card>
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
