"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";

export default function DashboardIndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/dashboard");
      return;
    }
    router.replace(
      user.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client"
    );
  }, [user, loading, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-turquoise border-t-transparent animate-spin" />
    </div>
  );
}
