import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Jokoo — Services · Mobilité · Family au Sénégal",
  description:
    "Plombiers, électriciens, coiffeurs, baby-sitters, covoiturage et livraison partout au Sénégal. Prestataires vérifiés, paiement sécurisé, assistance 24/7.",
};

const services = [
  { icon: "🔧", title: "Plomberie", desc: "Fuites, installations, dépannages 24/7" },
  { icon: "⚡", title: "Électricité", desc: "Panneaux, câblage, dépannages certifiés" },
  { icon: "💇🏾", title: "Coiffure", desc: "Coiffeurs à domicile, tresses, coupes" },
  { icon: "🧹", title: "Ménage", desc: "Nettoyage régulier ou ponctuel" },
  { icon: "🎨", title: "Peinture", desc: "Intérieur, extérieur, décoration" },
  { icon: "🪛", title: "Bricolage", desc: "Montage, réparations, petits travaux" },
  { icon: "❄️", title: "Climatisation", desc: "Installation, entretien, réparation" },
  { icon: "🚚", title: "Déménagement", desc: "Local ou longue distance" },
];

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-midnight via-midnight to-midnight-dark text-white">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-turquoise rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-turquoise-light rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 md:pt-32 md:pb-40 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-full text-sm mb-6 border border-white/20">
              🇸🇳 <span>Fabriqué au Sénégal, pour le Sénégal</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight">
              Le marketplace qui <span className="text-turquoise">rapproche</span> les Sénégalais.
            </h1>
            <p className="mt-6 text-lg text-white/80 max-w-lg">
              Services à domicile, covoiturage, livraison et Jokoo Family — tout dans une seule app.
              Prestataires vérifiés, paiement sécurisé, assistance 24/7.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#download" className="px-6 py-4 rounded-full bg-turquoise text-midnight font-extrabold hover:bg-turquoise-light transition shadow-xl shadow-turquoise/20">
                Télécharger Jokoo
              </a>
              <Link href="/prestataires" className="px-6 py-4 rounded-full border-2 border-white/20 hover:bg-white/10 font-bold transition">
                Devenir prestataire
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-white/70">
              <Stat n="10K+" label="Prestataires" />
              <Stat n="50K+" label="Clients" />
              <Stat n="4.9★" label="Note moyenne" />
            </div>
          </div>
          <div className="relative hidden md:flex justify-center">
            <div className="relative w-72 h-[560px] rounded-[48px] bg-gradient-to-br from-white/10 to-white/5 border-4 border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black/40 rounded-b-2xl" />
              <div className="p-6 pt-10 flex flex-col gap-4">
                <div className="text-sm text-white/60">Bonjour Fatou 👋</div>
                <div className="text-xl font-bold">Que cherchez-vous aujourd'hui ?</div>
                <div className="mt-2 p-3 bg-white/10 rounded-2xl text-sm">🔍 Rechercher un service…</div>
                <PhoneCard icon="🚗" title="Covoiturage" subtitle="Dakar → Saly · 5000 FCFA" tint="rgba(0,194,168,0.2)" />
                <PhoneCard icon="👶" title="Baby-sitter" subtitle="Fatou D. · Vérifiée+" tint="rgba(76,217,196,0.15)" />
                <PhoneCard icon="🔧" title="Plombier urgent" subtitle="Ibrahima S. · Note 4.9" tint="rgba(255,255,255,0.08)" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <SectionTitle eyebrow="Services à domicile" title="Trouvez le bon prestataire, près de chez vous." />
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4">
            {services.map((s) => (
              <div key={s.title} className="group p-6 rounded-3xl border border-gray-100 hover:border-turquoise hover:shadow-xl hover:-translate-y-1 transition-all bg-white">
                <div className="text-4xl">{s.icon}</div>
                <div className="mt-3 font-bold text-midnight">{s.title}</div>
                <div className="text-xs text-gray-500 mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MOBILITE */}
      <section id="mobilite" className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1">
            <SectionTitle eyebrow="Jokoo Mobilité" title="Covoiturage & Livraison longue distance." align="left" />
            <ul className="mt-8 space-y-4 text-gray-700">
              <Bullet icon="🚗" title="Covoiturage courte & longue distance" desc="Dakar → Saint-Louis, Thiès, Ziguinchor et plus." />
              <Bullet icon="📦" title="Livraison de colis" desc="Envoyez un colis via un trajet existant, économique et rapide." />
              <Bullet icon="🔁" title="Trajets récurrents" desc="Réservez votre trajet quotidien à un tarif préférentiel." />
              <Bullet icon="🛡️" title="Conducteurs vérifiés" desc="Permis, assurance et pièces d'identité vérifiés." />
            </ul>
          </div>
          <div className="order-1 md:order-2 relative">
            <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-turquoise/20 to-midnight/10 border border-turquoise/20 p-8 flex items-center justify-center">
              <div className="text-8xl">🚗📦</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAMILY */}
      <section id="family" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-midnight to-midnight-dark p-8 flex items-center justify-center">
              <div className="text-8xl">👨‍👩‍👧‍👦</div>
            </div>
          </div>
          <div>
            <SectionTitle eyebrow="Jokoo Family" title="Baby-sitting, tutorat et activités éducatives." align="left" />
            <ul className="mt-8 space-y-4 text-gray-700">
              <Bullet icon="👶" title="Baby-sitters vérifiées+" desc="Casier judiciaire, formation premiers secours, références." />
              <Bullet icon="📚" title="Cours particuliers" desc="Français, maths, arabe, wolof — tous niveaux." />
              <Bullet icon="🌍" title="Multilingue" desc="Français, wolof, anglais, arabe." />
              <Bullet icon="🚨" title="Bouton SOS intégré" desc="Alerte instantanée avec géolocalisation." />
            </ul>
          </div>
        </div>
      </section>

      {/* SECURITE / CONFIANCE */}
      <section className="py-24 bg-gradient-to-br from-midnight to-midnight-dark text-white">
        <div className="max-w-6xl mx-auto px-6">
          <SectionTitle eyebrow="Sécurité & confiance" title="Une plateforme construite sur la confiance." dark />
          <div className="mt-14 grid md:grid-cols-3 gap-6">
            <TrustCard icon="✅" title="Prestataires vérifiés" desc="Identité, compétences et expérience vérifiés avant activation." />
            <TrustCard icon="💳" title="Paiement sécurisé" desc="Stripe, Wave, Orange Money. Escrow sur demande." />
            <TrustCard icon="📞" title="Support 24/7" desc="Notre équipe basée à Dakar vous répond 7j/7." />
          </div>
        </div>
      </section>

      {/* DOWNLOAD */}
      <section id="download" className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-turquoise/10 text-turquoise px-4 py-2 rounded-full text-sm font-bold mb-4">
            📱 Application mobile
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-midnight">
            Téléchargez Jokoo. C'est gratuit.
          </h2>
          <p className="mt-4 text-gray-600 text-lg">
            Disponible bientôt sur iOS et Android. Inscrivez-vous pour être notifié·e du lancement.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <div className="px-6 py-4 rounded-2xl bg-midnight text-white font-bold flex items-center gap-3 cursor-not-allowed opacity-80">
               <div className="text-left leading-tight">
                <div className="text-xs text-white/60">Bientôt sur</div>
                <div className="text-lg">App Store</div>
              </div>
            </div>
            <div className="px-6 py-4 rounded-2xl bg-midnight text-white font-bold flex items-center gap-3 cursor-not-allowed opacity-80">
              ▶️
              <div className="text-left leading-tight">
                <div className="text-xs text-white/60">Bientôt sur</div>
                <div className="text-lg">Google Play</div>
              </div>
            </div>
          </div>
          <div className="mt-14 grid md:grid-cols-2 gap-4">
            <Link href="/prestataires" className="p-6 rounded-3xl bg-gradient-to-br from-turquoise/10 to-turquoise/5 border border-turquoise/20 hover:border-turquoise transition group text-left">
              <div className="text-3xl">💼</div>
              <div className="mt-3 font-bold text-midnight text-lg">Vous êtes prestataire ?</div>
              <div className="text-sm text-gray-600 mt-1">Rejoignez plus de 10 000 pros qui développent leur activité avec Jokoo.</div>
              <div className="mt-3 text-turquoise font-bold group-hover:underline">S'inscrire gratuitement →</div>
            </Link>
            <Link href="/contact" className="p-6 rounded-3xl bg-gradient-to-br from-midnight/5 to-midnight/10 border border-midnight/10 hover:border-midnight/30 transition group text-left">
              <div className="text-3xl">💬</div>
              <div className="mt-3 font-bold text-midnight text-lg">Vous avez une question ?</div>
              <div className="text-sm text-gray-600 mt-1">Notre équipe est basée à Dakar et répond en français & wolof.</div>
              <div className="mt-3 text-midnight font-bold group-hover:underline">Nous contacter →</div>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-black text-white">{n}</div>
      <div className="text-xs text-white/60 mt-0.5">{label}</div>
    </div>
  );
}

function PhoneCard({ icon, title, subtitle, tint }: { icon: string; title: string; subtitle: string; tint: string }) {
  return (
    <div className="p-3 rounded-2xl flex items-center gap-3" style={{ background: tint }}>
      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">{icon}</div>
      <div className="flex-1">
        <div className="font-bold text-sm">{title}</div>
        <div className="text-xs text-white/60">{subtitle}</div>
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, align = "center", dark = false }: { eyebrow: string; title: string; align?: "center" | "left"; dark?: boolean }) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <div className={`inline-block text-sm font-bold ${dark ? "text-turquoise" : "text-turquoise"} uppercase tracking-widest`}>{eyebrow}</div>
      <h2 className={`mt-3 text-3xl md:text-5xl font-black leading-tight ${dark ? "text-white" : "text-midnight"}`}>{title}</h2>
    </div>
  );
}

function Bullet({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <li className="flex gap-4">
      <div className="w-11 h-11 rounded-2xl bg-turquoise/10 text-turquoise flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
      <div>
        <div className="font-bold text-midnight">{title}</div>
        <div className="text-sm text-gray-600 mt-0.5">{desc}</div>
      </div>
    </li>
  );
}

function TrustCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="p-6 rounded-3xl bg-white/5 backdrop-blur border border-white/10 hover:border-turquoise/40 transition">
      <div className="text-4xl">{icon}</div>
      <div className="mt-4 font-bold text-lg">{title}</div>
      <div className="mt-2 text-white/70 text-sm">{desc}</div>
    </div>
  );
}
