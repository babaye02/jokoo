"use client";

import { useCallback, useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop" | "unknown";

// Config via env vars — auto-updated when Play Store / App Store are live.
// Set NEXT_PUBLIC_APK_URL to enable direct APK download (e.g. "/downloads/jokoo-latest.apk").
// Leave empty until you host the APK.
const APK_URL = process.env.NEXT_PUBLIC_APK_URL || "";
const IOS_STORE_URL = process.env.NEXT_PUBLIC_IOS_APP_URL || ""; // empty = not yet published
const ANDROID_STORE_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || ""; // empty = not yet published

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = (navigator.userAgent || "").toLowerCase();
  // iOS detection (incl. iPadOS 13+ which reports as MacIntel)
  const isIOS = /iphone|ipad|ipod/.test(ua) || (ua.includes("mac") && typeof document !== "undefined" && "ontouchend" in document);
  if (isIOS) return "ios";
  if (/android/.test(ua)) return "android";
  if (/mobi|tablet/.test(ua)) return "unknown";
  return "desktop";
}

export type Toast = { type: "info" | "success" | "error"; message: string } | null;

export function useDownloadHandler() {
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleDownload = useCallback((event?: React.MouseEvent) => {
    event?.preventDefault();
    const platform = detectPlatform();

    if (platform === "ios") {
      if (IOS_STORE_URL) {
        window.location.href = IOS_STORE_URL;
      } else {
        setToast({ type: "info", message: "Disponible prochainement sur l'App Store 🍎" });
      }
      return;
    }

    if (platform === "android") {
      if (ANDROID_STORE_URL) {
        window.location.href = ANDROID_STORE_URL;
        return;
      }
      if (!APK_URL) {
        setToast({
          type: "info",
          message: "L'APK Android sera bientôt disponible ici. Merci de votre patience 🤖",
        });
        return;
      }
      // Download the latest APK
      try {
        const link = document.createElement("a");
        link.href = APK_URL;
        link.download = "jokoo-latest.apk";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast({ type: "success", message: "Téléchargement de Jokoo lancé… 📥" });
      } catch {
        setToast({ type: "error", message: "Impossible de démarrer le téléchargement. Réessayez." });
      }
      return;
    }

    // Desktop / autre → scroll vers section download
    const target = document.getElementById("download");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    else setToast({ type: "info", message: "Ouvrez ce site depuis votre téléphone pour télécharger l'app." });
  }, []);

  return { handleDownload, toast, setToast };
}

export function DownloadToast({ toast }: { toast: Toast }) {
  if (!toast) return null;
  const bg = toast.type === "success" ? "bg-turquoise" : toast.type === "error" ? "bg-red-500" : "bg-midnight";
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

/** Full-featured smart download button. Accepts optional children for custom styling. */
export function DownloadButton({
  className,
  children,
  testId,
}: {
  className?: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  const { handleDownload, toast } = useDownloadHandler();
  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
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
 * Store buttons (bottom of homepage). Each triggers the same platform-aware handler
 * so users get consistent behavior no matter which one they tap.
 */
export function StoreButtons() {
  const { handleDownload, toast } = useDownloadHandler();

  const iosLive = !!IOS_STORE_URL;
  const androidLive = !!ANDROID_STORE_URL;

  return (
    <>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={handleDownload}
          data-testid="store-ios-btn"
          className={`px-6 py-4 rounded-2xl bg-midnight text-white font-bold flex items-center gap-3 transition ${iosLive ? "hover:bg-midnight-dark cursor-pointer" : "opacity-90 hover:opacity-100 cursor-pointer"}`}
        >
          <span className="text-2xl"></span>
          <div className="text-left leading-tight">
            <div className="text-xs text-white/60">{iosLive ? "Télécharger sur" : "Bientôt sur"}</div>
            <div className="text-lg">App Store</div>
          </div>
        </button>
        <button
          type="button"
          onClick={handleDownload}
          data-testid="store-android-btn"
          className={`px-6 py-4 rounded-2xl bg-midnight text-white font-bold flex items-center gap-3 transition ${androidLive ? "hover:bg-midnight-dark cursor-pointer" : "hover:bg-midnight-dark cursor-pointer"}`}
        >
          <span className="text-2xl">▶️</span>
          <div className="text-left leading-tight">
            <div className="text-xs text-white/60">
              {androidLive ? "Télécharger sur" : "APK direct pour"}
            </div>
            <div className="text-lg">{androidLive ? "Google Play" : "Android"}</div>
          </div>
        </button>
      </div>
      <DownloadToast toast={toast} />
    </>
  );
}
