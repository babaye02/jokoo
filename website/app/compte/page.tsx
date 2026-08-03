"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import AuthGate from "../components/AuthGate";
import { Btn, Card, Field, Input, ErrorBanner } from "../components/ui";
import { apiFetch } from "../lib/api";

export default function ComptePage() {
  return (
    <AuthGate>
      <CompteInner />
    </AuthGate>
  );
}

function CompteInner() {
  const { user, signOut, refresh, switchRole } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [city, setCity] = useState(user?.city || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  if (!user) return null;

  const hasBoth =
    user.roles?.includes("client") && user.roles?.includes("prestataire");
  const dashHref =
    user.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");
    setSaving(true);
    try {
      await apiFetch.patch("/auth/me", {
        name: name.trim(),
        phone: phone.trim() || null,
        city: city.trim() || null,
      });
      await refresh();
      setOk("Profil mis à jour.");
    } catch (e: any) {
      setError(e?.message || "Erreur lors de la mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const handleSwitch = async () => {
    try {
      const u = await switchRole();
      router.push(
        u.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client"
      );
    } catch {}
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-midnight">Mon profil</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gérez vos informations personnelles.
          </p>
        </div>
        <Btn href={dashHref} variant="secondary">
          ← Tableau de bord
        </Btn>
      </div>

      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-turquoise text-white text-2xl font-bold flex items-center justify-center overflow-hidden">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              (user.name?.[0] || "?").toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-midnight text-lg truncate">{user.name}</div>
            <div className="text-sm text-gray-500 truncate">{user.email}</div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-turquoise/10 text-turquoise text-[10px] font-bold uppercase px-2 py-0.5">
              {user.active_role === "prestataire" ? "Prestataire" : "Client"}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="font-bold text-midnight text-lg mb-4">Informations personnelles</h2>
        <form onSubmit={save} className="space-y-4">
          <Field label="Nom complet">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="compte-name"
            />
          </Field>
          <Field label="Email">
            <Input type="email" value={user.email} disabled />
          </Field>
          <Field label="Téléphone">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+221 77 000 00 00"
              data-testid="compte-phone"
            />
          </Field>
          <Field label="Ville">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Dakar, Thiès…"
              data-testid="compte-city"
            />
          </Field>
          {error ? <ErrorBanner message={error} /> : null}
          {ok ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">
              {ok}
            </div>
          ) : null}
          <div className="flex gap-3">
            <Btn type="submit" disabled={saving} data-testid="compte-save">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Btn>
          </div>
        </form>
      </Card>

      <Card className="mb-6">
        <h2 className="font-bold text-midnight text-lg mb-2">Rôle actif</h2>
        <p className="text-sm text-gray-500 mb-4">
          Basculez entre votre profil Client et Prestataire à tout moment.
        </p>
        {hasBoth ? (
          <Btn onClick={handleSwitch} variant="primary">
            🔄 Basculer vers{" "}
            {user.active_role === "prestataire" ? "Client" : "Prestataire"}
          </Btn>
        ) : (
          <div className="flex flex-wrap gap-3 items-center">
            <div className="text-sm text-gray-600">
              Vous êtes actuellement <b>{user.active_role === "prestataire" ? "Prestataire" : "Client"}</b>.
            </div>
            {user.active_role === "client" ? (
              <Btn href="/devenir-prestataire" variant="secondary">
                Devenir prestataire
              </Btn>
            ) : null}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-bold text-midnight text-lg mb-2">Sécurité</h2>
        <p className="text-sm text-gray-500 mb-4">
          Réinitialisez votre mot de passe ou déconnectez-vous.
        </p>
        <div className="flex flex-wrap gap-3">
          <Btn href="/forgot-password" variant="secondary">
            Réinitialiser mon mot de passe
          </Btn>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-full text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition"
            data-testid="compte-signout"
          >
            Se déconnecter
          </button>
        </div>
      </Card>

      <div className="mt-8 text-center text-sm text-gray-400">
        <Link href="/legal" className="hover:underline">
          Mentions légales & CGU
        </Link>
      </div>
    </div>
  );
}
