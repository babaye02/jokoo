// Pricing helpers — Jokoo n'a plus de tarif horaire.
// Un prestataire déclare un mode :
//   - fixed : prix ferme par prestation (ex: 15 000 F)
//   - from  : prix "à partir de" (ex: Dès 10 000 F)
//   - quote : sur devis (le prestataire envoie un montant après avoir vu la demande)

import type { PriceType, Provider, Booking } from "@/src/api";

export function formatXof(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR").replace(/,/g, " ")} F`;
}

/** Libellé prix compact pour cartes / listes (2 lignes max). */
export function priceLabel(p: Pick<Provider, "price_type" | "price_amount"> | null | undefined): string {
  if (!p) return "Sur devis";
  const type: PriceType = p.price_type || "quote";
  if (type === "quote" || p.price_amount == null) return "Sur devis";
  if (type === "from") return `Dès ${formatXof(p.price_amount)}`;
  return formatXof(p.price_amount);
}

/** Libellé long pour la fiche prestataire. */
export function priceLabelLong(p: Pick<Provider, "price_type" | "price_amount"> | null | undefined): string {
  if (!p) return "Devis sur demande";
  const type: PriceType = p.price_type || "quote";
  if (type === "quote" || p.price_amount == null) return "Devis sur demande";
  if (type === "from") return `À partir de ${formatXof(p.price_amount)}`;
  return `${formatXof(p.price_amount)} · Prix fixe`;
}

/** Prix affiché sur une réservation (côté client et prestataire). */
export function bookingPriceLabel(b: Pick<Booking, "price" | "price_type" | "quote_amount">): string {
  if (b.quote_amount) return formatXof(b.quote_amount);
  if (b.price) return formatXof(b.price);
  if (b.price_type === "quote") return "Devis à venir";
  return "—";
}
