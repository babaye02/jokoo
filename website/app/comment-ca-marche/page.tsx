export const metadata = {
  title: "Comment ça marche",
  description: "Découvrez comment fonctionne Jokoo, de la recherche du prestataire à la réservation et au paiement.",
};

const STEPS = [
  { n: 1, title: "Recherchez un prestataire", desc: "Parcourez les métiers par catégorie ou lancez une recherche libre. Filtrez par ville, prix et note." },
  { n: 2, title: "Consultez son profil", desc: "Découvrez son parcours, ses avis clients, ses tarifs et son mode d'intervention." },
  { n: 3, title: "Réservez en 2 clics", desc: "Choisissez un créneau parmi ses disponibilités et validez votre demande." },
  { n: 4, title: "Communiquez", desc: "Échangez directement avec le prestataire via la messagerie intégrée." },
  { n: 5, title: "Payez en toute sécurité", desc: "Le paiement est déclenché à la fin de la prestation via Stripe, Wave ou Orange Money." },
  { n: 6, title: "Laissez un avis", desc: "Aidez les autres clients en partageant votre expérience." },
];

export default function CommentCaMarchePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <header className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight">Comment ça marche</h1>
        <p className="text-lg text-gray-600 mt-3">
          Jokoo, c&apos;est simple. Voici le parcours en 6 étapes.
        </p>
      </header>
      <div className="space-y-4">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-5 items-start bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-turquoise/10 text-turquoise flex items-center justify-center font-black text-lg flex-shrink-0">
              {s.n}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-midnight">{s.title}</h2>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
