import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";
import { DownloadButton } from "./components/DownloadButton";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://jokooservices.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Jokoo — Le marketplace qui rapproche les Sénégalais",
    template: "%s · Jokoo",
  },
  description:
    "Trouvez plombiers, électriciens, coiffeurs, baby-sitters, covoiturage et livraison partout au Sénégal. Prestataires vérifiés, paiement sécurisé, assistance 24/7.",
  keywords: [
    "Jokoo",
    "Sénégal",
    "services",
    "marketplace",
    "covoiturage",
    "livraison",
    "baby-sitting",
    "prestataires",
    "Dakar",
    "plombier",
    "électricien",
    "coiffeur",
  ],
  openGraph: {
    title: "Jokoo — Services · Mobilité · Family",
    description:
      "Le marketplace sénégalais qui rapproche clients et prestataires vérifiés.",
    url: SITE,
    siteName: "Jokoo",
    locale: "fr_SN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jokoo — Services · Mobilité · Family",
    description:
      "Le marketplace sénégalais qui rapproche clients et prestataires vérifiés.",
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-white text-gray-900">
        <Script
          id="jsonld-organization"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Jokoo Services",
              url: SITE,
              logo: `${SITE}/icon.png`,
              sameAs: [],
              address: {
                "@type": "PostalAddress",
                addressCountry: "SN",
                addressLocality: "Dakar",
              },
              contactPoint: {
                "@type": "ContactPoint",
                email: "contact@jokooservices.com",
                contactType: "customer service",
                availableLanguage: ["French", "Wolof", "English", "Arabic"],
              },
            }),
          }}
        />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
      <nav className="max-w-6xl mx-auto flex items-center justify-between p-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-midnight text-turquoise flex items-center justify-center font-black">J</div>
          <span className="font-extrabold text-midnight text-lg">Jokoo</span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-700">
          <Link href="/#services" className="hover:text-turquoise transition">Services</Link>
          <Link href="/#mobilite" className="hover:text-turquoise transition">Mobilité</Link>
          <Link href="/#family" className="hover:text-turquoise transition">Family</Link>
          <Link href="/prestataires" className="hover:text-turquoise transition">Prestataires</Link>
          <Link href="/blog" className="hover:text-turquoise transition">Blog</Link>
          <Link href="/legal" className="hover:text-turquoise transition">Juridique</Link>
        </div>
        <Link href="/#download" className="px-4 py-2 rounded-full bg-turquoise text-white font-bold text-sm hover:bg-turquoise-light transition md:hidden">
          Télécharger
        </Link>
        <div className="hidden md:block">
          <DownloadButton
            testId="header-download-btn"
            className="px-4 py-2 rounded-full bg-turquoise text-white font-bold text-sm hover:bg-turquoise-light transition"
          >
            Télécharger
          </DownloadButton>
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-midnight text-white/80 mt-24">
      <div className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-turquoise text-midnight flex items-center justify-center font-black">J</div>
            <span className="font-extrabold text-white text-lg">Jokoo</span>
          </div>
          <p className="text-sm">
            Le marketplace qui rapproche les Sénégalais. Services, mobilité et famille — tout dans une seule app.
          </p>
        </div>
        <FooterCol
          title="Découvrir"
          links={[
            ["Services à domicile", "/#services"],
            ["Mobilité", "/#mobilite"],
            ["Jokoo Family", "/#family"],
            ["Blog", "/blog"],
          ]}
        />
        <FooterCol
          title="À propos"
          links={[
            ["Qui sommes-nous", "/apropos"],
            ["Devenir prestataire", "/prestataires"],
            ["Contact", "/contact"],
            ["FAQ", "/legal/faq"],
          ]}
        />
        <FooterCol
          title="Juridique"
          links={[
            ["Centre juridique", "/legal"],
            ["CGU", "/legal/cgu"],
            ["Confidentialité", "/legal/privacy"],
            ["Cookies", "/legal/cookies"],
            ["Mentions légales", "/legal/mentions-legales"],
          ]}
        />
      </div>
      <div className="border-t border-white/10 py-6 text-center text-xs text-white/50">
        © {new Date().getFullYear()} Jokoo Services SARL — Sénégal 🇸🇳 · jokooservices.com
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="font-bold text-white mb-3">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={href + label}>
            <Link href={href} className="hover:text-turquoise transition">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
