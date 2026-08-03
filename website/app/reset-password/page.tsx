"use client";
/**
 * /reset-password?token=xxx
 *
 * Cette page reçoit le token de reset via l'URL, le lit immédiatement en mémoire
 * puis nettoie la barre d'adresse (history.replaceState) pour que l'utilisateur
 * ne voie ni le token ni le paramètre — l'URL reste `/reset-password` uniquement.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordInner() {
  const params = useSearchParams();
  // Récupération du token une seule fois (avant nettoyage de l'URL).
  const initialToken = useMemo(() => params.get("token") || "", [params]);
  const [token] = useState<string>(initialToken);

  // Nettoyage de l'URL dès le montage : le user voit `/reset-password` sans le token.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api";

  const submit = useCallback(async () => {
    setErr(null);
    if (!token) {
      setErr("Lien invalide ou expiré. Redemandez un email de réinitialisation.");
      return;
    }
    if (pwd.length < 8) {
      setErr("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (pwd !== confirm) {
      setErr("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: pwd }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || "Impossible de réinitialiser le mot de passe");
      }
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Erreur inattendue");
    } finally {
      setBusy(false);
    }
  }, [token, pwd, confirm, apiBase]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-center mb-6">
          <div className="inline-block text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent">
            Jokoo
          </div>
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {done ? (
            <>
              <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-full bg-teal-100">
                <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">
                Mot de passe mis à jour
              </h1>
              <p className="text-center text-slate-600 mb-6">
                Vous pouvez maintenant vous connecter dans l&apos;app Jokoo avec votre nouveau mot de passe.
              </p>
              <a
                href="jokoo://login"
                className="block w-full text-center bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 transition"
              >
                Ouvrir l&apos;app Jokoo
              </a>
              <Link
                href="/"
                className="block text-center mt-3 text-sm text-slate-500 hover:text-slate-700"
              >
                Retour à l&apos;accueil
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                Nouveau mot de passe
              </h1>
              <p className="text-slate-600 mb-6">
                Choisissez un mot de passe sécurisé pour votre compte Jokoo.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    minLength={8}
                    required
                    autoFocus
                    autoComplete="new-password"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Au moins 8 caractères"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Retapez le mot de passe"
                  />
                </div>

                {err && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                    {err}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !pwd || !confirm}
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {busy ? "Enregistrement…" : "Mettre à jour le mot de passe"}
                </button>
              </form>

              {!token && (
                <p className="mt-6 text-center text-sm text-slate-500">
                  Ce lien est invalide ou a expiré.{" "}
                  <Link href="/" className="text-teal-600 hover:underline">
                    Demander un nouveau lien
                  </Link>
                </p>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 Jokoo Services · <Link href="/legal" className="hover:underline">Mentions légales</Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
