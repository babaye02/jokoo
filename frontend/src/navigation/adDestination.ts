// Central helper to route ad/promo/CTA destinations.
// - Bannières (AdBanner) et Promos (bouton CTA) partagent le même contrat.
// - Fallback rétro-compatible avec l'ancien schema `link` string:
//     "category:plombier" | "provider:<id>" | "app:home"
import { Linking } from "react-native";
import type { Router } from "expo-router";
import type { AdLinkType } from "./api";

export type NavItem = {
  link_type?: AdLinkType | null;
  link_target?: string | null;
  link?: string | null;
  // extras for legacy category placement
  category_key?: string | null;
};

/**
 * Parse legacy `link` string into a (type, target) tuple.
 * Returns null if no legacy pattern matched.
 */
function decodeLegacyLink(link: string | null | undefined): { type: AdLinkType; target: string } | null {
  if (!link) return null;
  if (link.startsWith("category:")) return { type: "category", target: link.split(":")[1] };
  if (link.startsWith("provider:")) return { type: "provider", target: link.split(":")[1] };
  if (link.startsWith("app:home")) return { type: "app_route", target: "/(tabs)/search" };
  if (link.startsWith("app:")) return { type: "app_route", target: `/${link.split(":")[1]}` };
  if (/^https?:\/\//i.test(link)) return { type: "external", target: link };
  return null;
}

/**
 * Route the user based on structured link_type/link_target, falling back to legacy `link`.
 * Returns true if a navigation was performed.
 */
export async function openAdDestination(item: NavItem, router: Router): Promise<boolean> {
  let type: AdLinkType | null | undefined = item.link_type;
  let target: string | null | undefined = item.link_target;

  // Fallback : décoder l'ancien champ `link` s'il n'y a pas de destination structurée.
  if (!type || type === "none") {
    const legacy = decodeLegacyLink(item.link);
    if (legacy) {
      type = legacy.type;
      target = legacy.target;
    }
  }

  if (!type || type === "none" || !target) return false;

  switch (type) {
    case "provider":
      router.push(`/provider/${target}` as any);
      return true;
    case "category":
      router.push({ pathname: "/(tabs)/search", params: { service: target } });
      return true;
    case "promo":
      router.push(`/promo/${target}` as any);
      return true;
    case "partner":
      router.push(`/partner/${target}` as any);
      return true;
    case "app_route":
      // Interne : "/mobility", "/(tabs)/family", etc.
      router.push((target.startsWith("/") ? target : `/${target}`) as any);
      return true;
    case "external":
      try {
        const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
        await Linking.openURL(url);
        return true;
      } catch {
        return false;
      }
  }
  return false;
}

/**
 * Short human-readable label for the admin list (e.g. "Fiche · Aminata Sy").
 */
export function describeDestination(item: NavItem): string {
  const type = item.link_type;
  if (!type || type === "none") {
    const legacy = decodeLegacyLink(item.link);
    if (!legacy) return "Aucune destination";
    return `${labelForType(legacy.type)} · ${item.link_label || legacy.target}`;
  }
  if (!item.link_target) return "Destination incomplète";
  return `${labelForType(type)} · ${item.link_label || item.link_target}`;
}

export function labelForType(t: AdLinkType): string {
  switch (t) {
    case "provider": return "Fiche prestataire";
    case "category": return "Catégorie";
    case "promo": return "Offre promo";
    case "partner": return "Partenaire";
    case "external": return "Lien externe";
    case "app_route": return "Section app";
    default: return "Aucune";
  }
}
