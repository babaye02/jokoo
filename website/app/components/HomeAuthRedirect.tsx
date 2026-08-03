"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";

/**
 * Monté sur la landing page publique.
 * Si l'utilisateur est connecté, redirige automatiquement vers son dashboard
 * (client ou prestataire selon active_role).
 *
 * N'affiche rien.
 */
export default function HomeAuthRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    const target =
      user.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client";
    router.replace(target);
  }, [user, loading, router]);

  return null;
}
