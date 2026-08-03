"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "../lib/api";
import { Btn, Card, ErrorBanner, Field, Input } from "../components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch.post("/auth/forgot-password", { email: email.trim().toLowerCase() }, { auth: false });
      setSent(true);
    } catch (e: any) {
      setError(e?.message || "Impossible d'envoyer l'email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-gray-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-midnight">Mot de passe oublié</h1>
          <p className="text-sm text-gray-500 mt-1">
            Renseignez votre email, nous vous enverrons un lien de réinitialisation.
          </p>
        </div>
        <Card>
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-turquoise/10 flex items-center justify-center mx-auto mb-4">
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-turquoise">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-midnight">Email envoyé !</h2>
              <p className="text-sm text-gray-500 mt-2">
                Consultez votre boîte de réception à <strong>{email}</strong> pour réinitialiser votre mot de passe.
              </p>
              <Btn href="/login" variant="ghost" className="mt-6">
                Retour à la connexion
              </Btn>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="forgot-email"
                  autoComplete="email"
                />
              </Field>
              {error ? <ErrorBanner message={error} /> : null}
              <Btn type="submit" fullWidth size="lg" disabled={busy} data-testid="forgot-submit">
                {busy ? "Envoi…" : "Envoyer le lien"}
              </Btn>
              <div className="text-center">
                <Link href="/login" className="text-sm text-gray-500 hover:underline">
                  Retour à la connexion
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
