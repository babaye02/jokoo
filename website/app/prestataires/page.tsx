import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Devenir prestataire Jokoo — Développez votre activité au Sénégal",
  description:
    "Rejoignez plus de 10 000 prestataires vérifiés. Inscription gratuite, paiements sécurisés, formation offerte. Plombiers, coiffeurs, chauffeurs, baby-sitters — développez votre clientèle avec Jokoo.",
};

const steps = [
  { n: "1", title: "Inscrivez-vous en 2 minutes", desc: "Créez votre profil et téléchargez vos pièces (CNI, permis, diplômes)." },
  { n: "2", title: "Vérification en 24-48h", desc: "Notre équipe valide votre identité et vos compétences." },
  { n: "3", title: "Recevez des demandes", desc: "Les clients proches de vous vous contactent directement dans l'app." },
  { n: "4", title: "Encaissez rapidement", desc: "Retraits Wave, Orange Money ou virement bancaire en 24h." },
];

const benefits = [
  { icon: "🎯", title: "Clients qualifiés", desc: "Ciblage géographique intelligent pour recevoir des demandes près de vous." },
  { icon: "💳", title: "Paiements sécurisés", desc: "Stripe, Wave, Orange Money. Vous êtes payé garanti après chaque mission." },
  { icon: "⭐", title: "Réputation en ligne", desc: "Recueillez avis et notes pour rassurer de nouveaux clients." },
  { icon: "📞", title: "Support dédié", desc: "Une équipe basée à Dakar vous accompagne 7j/7." },
  { icon: "🎓", title: "Formation gratuite", desc: "Webinaires et guides pour améliorer votre service et vos revenus." },
  { icon: "🏆", title: "Badge Vérifié+", desc: "Distinguez-vous et gagnez la confiance des clients premium." },
];

export default function PrestatairesPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-24">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-turquoise/20 border border-turquoise/30 text-turquoise px-4 py-2 rounded-full text-sm font-bold mb-6">
            💼 Programme prestataires
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Développez votre activité <br />avec <span className="text-turquoise">Jokoo</span>.
          </h1>
          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            Rejoignez plus de 10 000 prestataires vérifiés qui trouvent chaque jour de nouveaux clients partout au Sénégal.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a href="#inscription" className="px-6 py-4 rounded-full bg-turquoise text-midnight font-extrabold hover:bg-turquoise-light transition shadow-xl shadow-turquoise/30">
              S'inscrire gratuitement
            </a>
            <Link href="/#download" className="px-6 py-4 rounded-full border-2 border-white/20 hover:bg-white/10 font-bold transition">
              Télécharger l'app
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-sm font-bold text-turquoise uppercase tracking-widest">Comment ça marche</div>
            <h2 className="mt-3 text-3xl md:text-5xl font-black text-midnight leading-tight">4 étapes pour démarrer.</h2>
          </div>
          <div className="mt-16 grid md:grid-cols-4 gap-4">
            {steps.map((s) => (
              <div key={s.n} className="relative p-6 rounded-3xl border border-gray-100 bg-white hover:shadow-lg transition">
                <div className="w-12 h-12 rounded-2xl bg-turquoise text-white flex items-center justify-center font-black text-xl">{s.n}</div>
                <div className="mt-4 font-bold text-midnight">{s.title}</div>
                <div className="text-sm text-gray-500 mt-2">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-sm font-bold text-turquoise uppercase tracking-widest">Avantages</div>
            <h2 className="mt-3 text-3xl md:text-5xl font-black text-midnight leading-tight">Pourquoi choisir Jokoo ?</h2>
          </div>
          <div className="mt-16 grid md:grid-cols-3 gap-4">
            {benefits.map((b) => (
              <div key={b.title} className="p-6 rounded-3xl bg-white border border-gray-100">
                <div className="text-4xl">{b.icon}</div>
                <div className="mt-3 font-bold text-midnight">{b.title}</div>
                <div className="text-sm text-gray-500 mt-2">{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="inscription" className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-black text-midnight">Prêt·e à démarrer ?</h2>
          <p className="mt-4 text-gray-600 text-lg">
            Téléchargez Jokoo, créez votre profil prestataire et commencez à recevoir des demandes dès aujourd'hui.
          </p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Link href="/#download" className="px-6 py-4 rounded-full bg-turquoise text-midnight font-extrabold hover:bg-turquoise-light transition shadow-xl shadow-turquoise/20">
              Télécharger l'app
            </Link>
            <Link href="/contact" className="px-6 py-4 rounded-full border-2 border-midnight/20 hover:bg-midnight/5 font-bold transition text-midnight">
              Parler à un conseiller
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
