import Link from "next/link";
import { Btn } from "../components/ui";

export const metadata = {
  title: "Devenir prestataire",
  description: "Rejoignez Jokoo comme prestataire et développez votre activité au Sénégal.",
};

export default function DevenirPrestatairePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <section className="text-center mb-14">
        <h1 className="text-4xl md:text-5xl font-extrabold text-midnight">
          Devenez prestataire sur Jokoo
        </h1>
        <p className="text-lg text-gray-600 mt-4 max-w-2xl mx-auto">
          Recevez de nouveaux clients chaque jour, gérez vos réservations et développez votre activité — le tout depuis un seul compte.
        </p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <Btn href="/signup?role=prestataire" size="lg">
            Créer mon profil pro
          </Btn>
          <Btn href="/login" variant="secondary" size="lg">
            J&apos;ai déjà un compte
          </Btn>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        {[
          { emoji: "🎯", title: "Visibilité", desc: "Apparaissez auprès de milliers de clients à Dakar, Thiès et partout au Sénégal." },
          { emoji: "📅", title: "Agenda intelligent", desc: "Gérez vos disponibilités et acceptez les réservations en un clic." },
          { emoji: "💰", title: "Paiements sécurisés", desc: "Recevez vos paiements de manière fiable et suivez vos revenus en temps réel." },
        ].map((f) => (
          <div key={f.title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="text-3xl mb-3">{f.emoji}</div>
            <div className="font-bold text-midnight text-lg mb-1">{f.title}</div>
            <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 bg-midnight rounded-3xl p-10 text-center text-white">
        <h2 className="text-2xl md:text-3xl font-extrabold mb-3">
          Prêt à démarrer ?
        </h2>
        <p className="text-white/80 mb-6">
          Créez votre profil pro en 5 minutes et recevez vos premières demandes.
        </p>
        <Btn href="/signup?role=prestataire" variant="primary" size="lg">
          Commencer maintenant
        </Btn>
      </section>
    </div>
  );
}
