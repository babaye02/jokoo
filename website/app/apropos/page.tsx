import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "À propos de Jokoo — L'app qui rapproche les Sénégalais",
  description:
    "Jokoo est un marketplace 100% sénégalais qui connecte clients et prestataires vérifiés. Notre mission : simplifier le quotidien et créer des opportunités économiques pour tous.",
};

export default function AProposPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-2 rounded-full text-sm mb-6">
            🇸🇳 Fabriqué au Sénégal
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Notre mission : <span className="text-turquoise">rapprocher</span> les Sénégalais.
          </h1>
          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            Nous croyons qu'un plombier compétent, un chauffeur fiable ou une baby-sitter formée méritent de trouver leurs clients aussi facilement qu'un touriste trouve un taxi.
          </p>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-black text-midnight">Notre histoire</h2>
          <div className="mt-6 space-y-5 text-gray-700 leading-relaxed">
            <p>
              Jokoo est né d'un constat simple : trouver un bon prestataire au Sénégal repose encore trop souvent sur le bouche-à-oreille. Un plombier introuvable un dimanche soir, un chauffeur pour Saint-Louis en dernière minute, une baby-sitter de confiance pour un mariage — autant de moments de stress inutile.
            </p>
            <p>
              Nous avons donc construit une plateforme qui met en relation clients et prestataires en quelques secondes, avec des profils vérifiés, des avis honnêtes et des paiements sécurisés. Tout en français et en wolof, pensée pour tous les Sénégalais.
            </p>
            <p>
              <strong className="text-midnight">Jokoo</strong> (« se rencontrer » en wolof) n'est pas qu'une app. C'est un projet économique : chaque prestataire inscrit crée de la valeur, chaque client servi renforce la confiance, chaque mission remplie fait grandir notre écosystème.
            </p>
          </div>

          <div className="mt-16 grid md:grid-cols-3 gap-4">
            <ValueCard icon="🤝" title="Confiance" desc="Vérification stricte des prestataires : identité, compétences, références." />
            <ValueCard icon="💚" title="Impact local" desc="100% des équipes sénégalaises. Nous soutenons l'économie locale." />
            <ValueCard icon="✨" title="Excellence" desc="Un service premium accessible à tous, du village de Kaolack à Dakar Plateau." />
          </div>
        </div>
      </section>

      <section className="py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-midnight">L'équipe</h2>
          <p className="mt-4 text-gray-600">
            Basée à Dakar, notre équipe combine tech, terrain et passion. Nous parlons français, wolof, anglais et arabe.
          </p>
          <div className="mt-10 p-8 rounded-3xl bg-white border border-gray-100">
            <div className="text-6xl">🇸🇳</div>
            <div className="mt-4 font-bold text-midnight text-xl">Jokoo Services SARL</div>
            <div className="text-sm text-gray-500 mt-2">Immatriculée au Registre du Commerce de Dakar<br />Siège social : Dakar, Sénégal</div>
          </div>
        </div>
      </section>
    </>
  );
}

function ValueCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="p-6 rounded-3xl border border-gray-100 bg-white">
      <div className="text-4xl">{icon}</div>
      <div className="mt-3 font-bold text-midnight">{title}</div>
      <div className="mt-2 text-sm text-gray-500">{desc}</div>
    </div>
  );
}
