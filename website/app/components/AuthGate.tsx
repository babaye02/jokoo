"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useAuth } from "../lib/auth";

type Props = {
  children: ReactNode;
  requiredRole?: "client" | "prestataire";
};

export default function AuthGate({ children, requiredRole }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const url = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      router.replace(url);
      return;
    }
    if (requiredRole && user.active_role !== requiredRole) {
      // Redirige vers le dashboard adapté au rôle courant.
      router.replace(user.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client");
    }
  }, [user, loading, requiredRole, router]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-turquoise border-t-transparent animate-spin" />
      </div>
    );
  }
  if (requiredRole && user.active_role !== requiredRole) return null;

  return <>{children}</>;
}
