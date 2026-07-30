import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Jokoo Services",
  description: "Contactez l'équipe Jokoo. Support 7j/7 en français et wolof. Basés à Dakar, Sénégal.",
};

export default function ContactPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-midnight to-midnight-dark text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Une question ? <span className="text-turquoise">Parlons-en.</span>
          </h1>
          <p className="mt-6 text-lg text-white/80 max-w-xl mx-auto">
            Notre équipe basée à Dakar répond en français, wolof, anglais et arabe.
          </p>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-black text-midnight">Nos coordonnées</h2>
            <div className="mt-8 space-y-6">
              <ContactRow icon="📧" title="Email" value="contact@jokooservices.com" href="mailto:contact@jokooservices.com" />
              <ContactRow icon="📞" title="Téléphone / WhatsApp" value="+221 77 000 00 00" href="tel:+221770000000" />
              <ContactRow icon="🏢" title="Adresse" value={"Jokoo Services SARL\nDakar, Sénégal"} />
              <ContactRow icon="🕐" title="Support" value={"7j/7 · 8h – 22h\nUrgences 24/7 dans l'app"} />
            </div>
          </div>

          <form className="p-8 rounded-3xl bg-gray-50 border border-gray-100" action="mailto:contact@jokooservices.com" method="post" encType="text/plain">
            <h2 className="text-2xl font-black text-midnight">Écrivez-nous</h2>
            <div className="mt-6 space-y-4">
              <Field label="Nom complet" name="name" type="text" required />
              <Field label="Email" name="email" type="email" required />
              <Field label="Sujet" name="subject" type="text" />
              <div>
                <label className="block text-sm font-bold text-midnight mb-1">Message</label>
                <textarea name="message" rows={5} required className="w-full rounded-2xl border border-gray-200 px-4 py-3 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none transition" />
              </div>
              <button type="submit" className="w-full py-4 rounded-full bg-turquoise text-midnight font-extrabold hover:bg-turquoise-light transition">
                Envoyer le message
              </button>
              <div className="text-xs text-gray-500 text-center">Nous répondons sous 24h ouvrées.</div>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}

function ContactRow({ icon, title, value, href }: { icon: string; title: string; value: string; href?: string }) {
  const content = (
    <div className="flex gap-4">
      <div className="w-12 h-12 rounded-2xl bg-turquoise/10 text-turquoise flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</div>
        <div className="mt-1 text-midnight font-medium whitespace-pre-line">{value}</div>
      </div>
    </div>
  );
  return href ? <a href={href} className="block hover:opacity-80 transition">{content}</a> : content;
}

function Field({ label, name, type, required }: { label: string; name: string; type: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-bold text-midnight mb-1">{label}{required && <span className="text-red-500">*</span>}</label>
      <input name={name} type={type} required={required} className="w-full rounded-2xl border border-gray-200 px-4 py-3 focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 outline-none transition" />
    </div>
  );
}
