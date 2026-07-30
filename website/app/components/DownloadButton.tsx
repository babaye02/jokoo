"use client";

import { useCallback, useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop" | "unknown";

// Config via env vars — auto-updated when Play Store / App Store are live.
const APK_URL = process.env.NEXT_PUBLIC_APK_URL || "/downloads/jokoo-latest.apk";
const IOS_STORE_URL = process.env.NEXT_PUBLIC_IOS_APP_URL || "";
const ANDROID_STORE_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || "";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = (navigator.userAgent || "").toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes("mac") && typeof document !== "undefined" && "ontouchend" in document);
  if (isIOS) return "ios";
  if (/android/.test(ua)) return "android";
  if (/mobi|tablet/.test(ua)) return "unknown";
  return "desktop";
}

export type Toast = { type: "info" | "success" | "error"; message: string } | null;

// ------- Toast component -------
export function DownloadToast({ toast }: { toast: Toast }) {
  if (!toast) return null;
  const bg =
    toast.type === "success" ? "bg-turquoise" : toast.type === "error" ? "bg-red-500" : "bg-midnight";
  const text = toast.type === "success" ? "text-midnight" : "text-white";
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="download-toast"
      className={`fixed z-[100] left-1/2 -translate-x-1/2 bottom-8 max-w-sm w-[92%] px-5 py-4 rounded-2xl shadow-2xl border border-black/10 ${bg} ${text} font-bold text-sm text-center animate-in fade-in slide-in-from-bottom-4`}
    >
      {toast.message}
    </div>
  );
}

// ------- Reusable download hook -------
export function useDownloadHandler() {
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * Force le téléchargement de l'APK, quelle que soit la plateforme du visiteur.
   * Utilisé par les boutons "Android" et par les visiteurs Android depuis le bouton principal.
   */
  const downloadApk = useCallback(() => {
    if (ANDROID_STORE_URL) {
      window.location.href = ANDROID_STORE_URL;
      return;
    }
    try {
      const link = document.createElement("a");
      link.href = APK_URL;
      link.download = "jokoo-latest.apk";
      link.rel = "noopener";
      link.target = "_self";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setToast({ type: "success", message: "Téléchargement de l'APK Jokoo lancé… 📥" });
    } catch {
      // Fallback : navigation directe (au pire l'utilisateur récupère le fichier via la barre d'adresse)
      try {
        window.location.href = APK_URL;
        setToast({ type: "success", message: "Ouverture du fichier APK…" });
      } catch {
        setToast({ type: "error", message: "Impossible de démarrer le téléchargement. Réessayez." });
      }
    }
  }, []);

  /**
   * Ouvre l'App Store si l'app est publiée, sinon informe que ce n'est pas encore disponible.
   */
  const openIosStore = useCallback(() => {
    if (IOS_STORE_URL) {
      window.location.href = IOS_STORE_URL;
      return;
    }
    setToast({ type: "info", message: "Disponible prochainement sur l'App Store 🍎" });
  }, []);

  /**
   * Handler intelligent utilisé par le bouton principal "Télécharger Jokoo" — détecte la plateforme.
   */
  const handleSmartDownload = useCallback(
    (event?: React.MouseEvent) => {
      event?.preventDefault();
      const platform = detectPlatform();
      if (platform === "ios") {
        openIosStore();
        return;
      }
      if (platform === "android") {
        downloadApk();
        return;
      }
      // Desktop / autre : télécharger l'APK aussi (l'utilisateur pourra le transférer sur son téléphone)
      downloadApk();
    },
    [openIosStore, downloadApk]
  );

  return { toast, setToast, downloadApk, openIosStore, handleSmartDownload };
}

// ------- Main smart download button (hero, header) -------
export function DownloadButton({
  className,
  children,
  testId,
}: {
  className?: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  const { handleSmartDownload, toast } = useDownloadHandler();
  return (
    <>
      <button
        type="button"
        onClick={handleSmartDownload}
        data-testid={testId || "download-jokoo-btn"}
        className={className}
      >
        {children || "Télécharger Jokoo"}
      </button>
      <DownloadToast toast={toast} />
    </>
  );
}

/**
 * Boutons "Store" du bas de page.
 * - Le bouton "App Store" ouvre toujours le lien iOS (ou toast si non publié).
 * - Le bouton "Android" télécharge TOUJOURS l'APK (Play Store si publié).
 * Ce comportement est indépendant de la plateforme du visiteur — l'utilisateur choisit explicitement.
 */
export function StoreButtons() {
  const { downloadApk, openIosStore, toast } = useDownloadHandler();

  const iosLive = !!IOS_STORE_URL;
  const androidLive = !!ANDROID_STORE_URL;

  return (
    <>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={openIosStore}
          data-testid="store-ios-btn"
          className={`px-6 py-4 rounded-2xl bg-midnight text-white font-bold flex items-center gap-3 transition ${
            iosLive ? "hover:bg-midnight-dark" : "opacity-90 hover:opacity-100"
          } cursor-pointer`}
          aria-label="Télécharger Jokoo pour iPhone"
        >
          <span className="text-2xl"></span>
          <div className="text-left leading-tight">
            <div className="text-xs text-white/60">{iosLive ? "Télécharger sur" : "Bientôt sur"}</div>
            <div className="text-lg">App Store</div>
          </div>
        </button>

        {/* Anchor + button hybride : sur desktop l'attribut download déclenche le téléchargement natif ;
            sur Android, onClick prend le relais et déclenche le download programmatiquement. */}
        <a
          href={APK_URL}
          download="jokoo-latest.apk"
          onClick={(e) => {
            // Sur Play Store live → redirection ; sinon on garde le comportement natif de <a download>
            if (ANDROID_STORE_URL) {
              e.preventDefault();
              downloadApk();
            }
          }}
          data-testid="store-android-btn"
          className="px-6 py-4 rounded-2xl bg-midnight text-white font-bold flex items-center gap-3 transition hover:bg-midnight-dark cursor-pointer no-underline"
          aria-label="Télécharger l'APK Jokoo pour Android"
        >
          <span className="text-2xl">▶️</span>
          <div className="text-left leading-tight">
            <div className="text-xs text-white/60">
              {androidLive ? "Télécharger sur" : "APK direct pour"}
            </div>
            <div className="text-lg">{androidLive ? "Google Play" : "Android"}</div>
          </div>
        </a>
      </div>
      <DownloadToast toast={toast} />
    </>
  );
}
