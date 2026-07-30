import Link from "next/link";

export default function NotFound() {
  return (
    <section className="bg-white py-24">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <div className="text-8xl mb-6">🧭</div>
        <h1 className="text-4xl font-black text-midnight">Page introuvable</h1>
        <p className="mt-4 text-gray-600">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="px-6 py-3 rounded-full bg-turquoise text-white font-bold hover:bg-turquoise-light transition">
            Retour à l'accueil
          </Link>
          <Link href="/contact" className="px-6 py-3 rounded-full border-2 border-midnight/20 hover:bg-midnight/5 font-bold text-midnight transition">
            Nous contacter
          </Link>
        </div>
      </div>
    </section>
  );
}
