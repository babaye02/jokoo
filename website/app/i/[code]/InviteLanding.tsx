"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface InviteData {
  valid: boolean;
  code?: string;
  slug?: string;
  tier?: string;
  badge?: string;
  inviter_name?: string;
  inviter_avatar?: string;
  links?: {
    web?: string;
    web_slug?: string;
    app?: string;
    share_text?: string;
  };
}

const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ||
  "https://apps.apple.com/app/jokoo/id0";
const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL ||
  "https://play.google.com/store/apps/details?id=com.jokoo.app";

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return "ios";
  return "desktop";
}

export default function InviteLanding({
  code,
  data,
}: {
  code: string;
  data: InviteData | null;
}) {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | null>(
    null
  );
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);

    // On stocke le code d'invitation dans localStorage pour être ré-injecté au
    // signup, quel que soit le canal (retour depuis App Store).
    try {
      localStorage.setItem("jokoo_referral_code", code);
      localStorage.setItem("jokoo_referral_at", String(Date.now()));
    } catch {}

    // Tente d'ouvrir l'app native. Sur iOS/Android, si l'app est installée,
    // Universal Links / App Links interceptent directement l'URL — donc si on
    // arrive à cette page, c'est que l'app n'est PAS installée (ou l'utilisateur
    // a choisi "Continuer sur le navigateur"). On ne tente donc pas de
    // rediriger vers le scheme (jokoo://) pour éviter l'alerte "impossible d'ouvrir".
    // On propose plutôt un CTA store clair.
    setAttempted(true);
  }, [code]);

  if (!data?.valid) {
    return (
      <main className="min-h-screen bg-[#FAF9F7] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">🤝</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Invitation introuvable
          </h1>
          <p className="text-gray-600 mb-6">
            Le code <span className="font-mono font-bold">{code}</span> n&apos;est
            pas valide ou a expiré. Contactez le partenaire qui vous a envoyé le
            lien.
          </p>
          <Link
            href="/"
            className="inline-block bg-[#18C6A3] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#14a889] transition"
          >
            Découvrir Jokoo
          </Link>
        </div>
      </main>
    );
  }

  const primaryStoreUrl = platform === "android" ? PLAY_STORE_URL : APP_STORE_URL;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#7C3AED] via-[#6D28D9] to-[#5B21B6] text-white">
      <div className="max-w-md mx-auto px-6 py-10 flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🤝</div>
          <h1 className="text-3xl font-black tracking-tight">Jokoo Partners</h1>
          <p className="text-white/80 mt-1 text-sm">
            La marketplace de services au Sénégal
          </p>
        </div>

        {/* Inviter card */}
        <div className="w-full bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20 mb-6">
          <div className="flex items-center gap-4">
            {data.inviter_avatar ? (
              <Image
                src={data.inviter_avatar}
                alt={data.inviter_name || "Partenaire"}
                width={64}
                height={64}
                className="rounded-full border-2 border-white/40"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl">
                🤝
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm text-white/70">Invité·e par</p>
              <p className="text-xl font-bold">{data.inviter_name}</p>
              <p className="text-xs text-white/80 mt-1">{data.badge}</p>
            </div>
          </div>

          <div className="mt-6 bg-black/20 rounded-xl p-4 text-center">
            <p className="text-xs text-white/60 mb-1">VOTRE CODE</p>
            <p className="text-3xl font-black tracking-[0.3em]">{data.code}</p>
          </div>
        </div>

        {/* CTA */}
        {platform !== "desktop" ? (
          <a
            href={primaryStoreUrl}
            className="w-full bg-white text-[#5B21B6] font-bold text-lg py-4 rounded-2xl text-center shadow-xl hover:bg-gray-50 transition"
          >
            {platform === "ios" ? "📲 Ouvrir dans l'App Store" : "📲 Ouvrir dans le Play Store"}
          </a>
        ) : (
          <div className="w-full grid grid-cols-2 gap-3">
            <a
              href={APP_STORE_URL}
              className="bg-white text-[#5B21B6] font-bold py-3 rounded-2xl text-center hover:bg-gray-50 transition"
            >
              🍎 App Store
            </a>
            <a
              href={PLAY_STORE_URL}
              className="bg-white text-[#5B21B6] font-bold py-3 rounded-2xl text-center hover:bg-gray-50 transition"
            >
              ▶️ Play Store
            </a>
          </div>
        )}

        <p className="text-white/70 text-xs text-center mt-4">
          Votre code sera automatiquement appliqué lors de votre inscription.
        </p>

        {/* Benefits */}
        <div className="w-full mt-10 space-y-3">
          {[
            { icon: "🏠", text: "Trouvez des prestataires vérifiés près de chez vous" },
            { icon: "💰", text: "Payez en toute sécurité avec Wave, Orange Money ou espèces" },
            { icon: "⭐", text: "Notez et partagez vos expériences avec la communauté" },
            { icon: "🚗", text: "Covoiturage, livraison, garde d'enfants — tout en un" },
          ].map((b, i) => (
            <div
              key={i}
              className="flex items-start gap-3 bg-white/5 rounded-xl p-4"
            >
              <span className="text-2xl">{b.icon}</span>
              <span className="text-sm text-white/90 leading-relaxed">{b.text}</span>
            </div>
          ))}
        </div>

        <p className="text-white/50 text-xs text-center mt-10 mb-4">
          {attempted && platform !== "desktop"
            ? "Si l'app n'est pas installée, elle sera téléchargée automatiquement."
            : "© Jokoo Services SAS · Dakar, Sénégal"}
        </p>
      </div>
    </main>
  );
}
