"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { useAuth } from "../lib/auth";
import { Btn, Card, ErrorBanner, Field, Input } from "../components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-4rem)]" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || null;
  const { signIn, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Si déjà connecté, rediriger vers le dashboard adapté
  React.useEffect(() => {
    if (!authLoading && user) {
      const target =
        next ||
        (user.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client");
      router.replace(target);
    }
  }, [authLoading, user, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await signIn(email.trim().toLowerCase(), password);
      const target =
        next ||
        (u.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client");
      router.push(target);
    } catch (e: any) {
      setError(e?.message || "Identifiants invalides.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-gray-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-midnight">Se connecter</h1>
          <p className="text-sm text-gray-500 mt-1">
            Retrouvez votre compte Jokoo et poursuivez là où vous en étiez.
          </p>
        </div>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email"
                autoComplete="email"
              />
            </Field>
            <Field label="Mot de passe">
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password"
                autoComplete="current-password"
              />
            </Field>
            {error ? <ErrorBanner message={error} /> : null}
            <Btn type="submit" fullWidth size="lg" disabled={busy} data-testid="login-submit">
              {busy ? "Connexion…" : "Se connecter"}
            </Btn>
          </form>
          <div className="mt-4 text-center">
            <Link href="/forgot-password" className="text-sm text-turquoise hover:underline">
              Mot de passe oublié ?
            </Link>
          </div>
        </Card>
        <div className="text-center mt-6 text-sm text-gray-600">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-semibold text-turquoise hover:underline">
            Créer un compte
          </Link>
        </div>
      </div>
    </div>
  );
}
