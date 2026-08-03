"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "../lib/auth";
import { Btn, Card, ErrorBanner, Field, Input } from "../components/ui";

type Role = "client" | "prestataire";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-4rem)]" />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { signUp } = useAuth();
  const [role, setRole] = useState<Role>((sp.get("role") as Role) === "prestataire" ? "prestataire" : "client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Dakar");
  const [password, setPassword] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!accept) {
      setError("Vous devez accepter les Conditions d'utilisation.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setBusy(true);
    try {
      const u = await signUp({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        role,
        phone: phone.trim() || undefined,
        city: city.trim() || "Dakar",
      });
      router.push(u.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client");
    } catch (e: any) {
      setError(e?.message || "Impossible de créer le compte.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-gray-50 to-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-midnight">Créer un compte</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rejoignez la première plateforme sénégalaise de services.
          </p>
        </div>
        <Card>
          <div className="flex gap-2 mb-5">
            <button
              type="button"
              onClick={() => setRole("client")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
                role === "client"
                  ? "bg-midnight text-white border-midnight"
                  : "bg-white text-midnight border-gray-200 hover:border-turquoise"
              }`}
              data-testid="role-client"
            >
              Client
            </button>
            <button
              type="button"
              onClick={() => setRole("prestataire")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
                role === "prestataire"
                  ? "bg-midnight text-white border-midnight"
                  : "bg-white text-midnight border-gray-200 hover:border-turquoise"
              }`}
              data-testid="role-provider"
            >
              Prestataire
            </button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nom complet">
              <Input
                placeholder="Awa Diop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="signup-name"
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="signup-email"
                autoComplete="email"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Téléphone">
                <Input
                  placeholder="+221 77 000 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </Field>
              <Field label="Ville">
                <Input
                  placeholder="Dakar"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                />
              </Field>
            </div>
            <Field label="Mot de passe" hint="Au moins 6 caractères">
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="signup-password"
                autoComplete="new-password"
              />
            </Field>
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
                className="mt-0.5"
                data-testid="signup-accept"
              />
              <span>
                J&apos;accepte les{" "}
                <Link href="/legal" className="text-turquoise hover:underline">
                  Conditions d&apos;utilisation
                </Link>{" "}
                et la{" "}
                <Link href="/legal" className="text-turquoise hover:underline">
                  Politique de confidentialité
                </Link>.
              </span>
            </label>
            {error ? <ErrorBanner message={error} /> : null}
            <Btn type="submit" fullWidth size="lg" disabled={busy} data-testid="signup-submit">
              {busy ? "Création…" : "Créer mon compte"}
            </Btn>
          </form>
        </Card>
        <div className="text-center mt-6 text-sm text-gray-600">
          Déjà inscrit ?{" "}
          <Link href="/login" className="font-semibold text-turquoise hover:underline">
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
