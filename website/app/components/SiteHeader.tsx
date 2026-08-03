"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Btn } from "./ui";

const PUBLIC_NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/recherche", label: "Trouver un prestataire" },
  { href: "/devenir-prestataire", label: "Devenir prestataire" },
  { href: "/comment-ca-marche", label: "Comment ça marche" },
  { href: "/apropos", label: "À propos" },
  { href: "/contact", label: "Contact" },
];

function authNavLinks(activeRole?: string | null) {
  const dash =
    activeRole === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client";
  return [
    { href: dash, label: "Tableau de bord" },
    { href: "/recherche", label: "Rechercher" },
    { href: "/comment-ca-marche", label: "Aide" },
    { href: "/contact", label: "Contact" },
  ];
}

export default function SiteHeader() {
  const { user, loading, signOut, switchRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setMenuOpen(false);
    setMobileOpen(false);
    router.push("/");
  };

  const handleSwitch = async () => {
    try {
      const u = await switchRole();
      setMenuOpen(false);
      setMobileOpen(false);
      router.push(u.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client");
    } catch {}
  };

  const hasBoth = user?.roles?.includes("client") && user?.roles?.includes("prestataire");
  const navLinks = user ? authNavLinks(user.active_role) : PUBLIC_NAV_LINKS;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link
          href={user ? (user.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client") : "/"}
          className="flex items-center gap-2"
        >
          <div className="w-9 h-9 rounded-xl bg-midnight text-turquoise flex items-center justify-center font-black">
            J
          </div>
          <span className="font-extrabold text-midnight text-lg">Jokoo</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-gray-700">
          {navLinks.map((l) => {
            const isActive = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  isActive
                    ? "text-turquoise font-semibold"
                    : "hover:text-turquoise transition"
                }
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Right side : Auth zone */}
        <div className="hidden lg:flex items-center gap-2">
          {loading ? (
            <div className="w-24 h-9 rounded-full bg-gray-100 animate-pulse" />
          ) : user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 pl-1 pr-3 py-1"
                data-testid="account-menu-btn"
              >
                <div className="w-7 h-7 rounded-full bg-turquoise text-white text-xs font-bold flex items-center justify-center">
                  {user.name?.[0]?.toUpperCase() || "?"}
                </div>
                <span className="text-sm font-semibold text-midnight max-w-[120px] truncate">
                  {user.name}
                </span>
                <svg width={12} height={12} viewBox="0 0 20 20" fill="currentColor" className="text-gray-500">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-gray-100 shadow-lg py-2 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="text-sm font-bold text-midnight">{user.name}</div>
                    <div className="text-xs text-gray-500 truncate">{user.email}</div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-turquoise/10 text-turquoise text-[10px] font-bold uppercase px-2 py-0.5">
                      {user.active_role === "prestataire" ? "Prestataire" : "Client"}
                    </div>
                  </div>
                  <Link
                    href={user.active_role === "prestataire" ? "/dashboard/prestataire" : "/dashboard/client"}
                    className="block px-4 py-2 text-sm text-midnight hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Mon tableau de bord
                  </Link>
                  <Link
                    href="/compte"
                    className="block px-4 py-2 text-sm text-midnight hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Mon profil
                  </Link>
                  {hasBoth ? (
                    <button
                      onClick={handleSwitch}
                      className="w-full text-left px-4 py-2 text-sm text-turquoise font-semibold hover:bg-gray-50"
                    >
                      🔄 Basculer vers {user.active_role === "prestataire" ? "Client" : "Prestataire"}
                    </button>
                  ) : (
                    <Link
                      href="/devenir-prestataire"
                      className="block px-4 py-2 text-sm text-turquoise font-semibold hover:bg-gray-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      Devenir prestataire
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100 mt-1"
                    data-testid="signout-btn"
                  >
                    Déconnexion
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Btn href="/login" variant="ghost" size="sm">Connexion</Btn>
              <Btn href="/signup" variant="primary" size="sm">Inscription</Btn>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="lg:hidden p-2 -mr-2"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Menu"
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-midnight">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="lg:hidden border-t border-gray-100 px-4 py-4 space-y-1 bg-white">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-3 mt-3 border-t border-gray-100 space-y-2">
            {user ? (
              <>
                <Link
                  href="/compte"
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm font-medium text-midnight hover:bg-gray-50"
                >
                  Mon profil
                </Link>
                {hasBoth ? (
                  <button
                    onClick={handleSwitch}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-turquoise hover:bg-gray-50"
                  >
                    🔄 Basculer vers {user.active_role === "prestataire" ? "Client" : "Prestataire"}
                  </button>
                ) : null}
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Btn href="/login" variant="secondary" size="md" fullWidth>Connexion</Btn>
                <Btn href="/signup" variant="primary" size="md" fullWidth>Inscription</Btn>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
