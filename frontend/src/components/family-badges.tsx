import { Badge, BadgeRow } from "@/src/components/ui";
import { Babysitter } from "@/src/api";
import { PROFILE_TYPE_LABEL, langMeta } from "@/src/family";

/** Renders the trust badges for a babysitter — Airbnb/Apple/Notion style (neutral + colored icons only) */
export function TrustBadges({ b, compact }: { b: Babysitter; compact?: boolean }) {
  const langs = (b.languages || []).slice(0, 4).map((l) => langMeta(l.code).label).join(" · ");
  const size = compact ? "sm" : "md";
  const profileEmoji = PROFILE_TYPE_LABEL[b.profile_type || "student"]?.emoji || "🎓";
  const profileLbl = PROFILE_TYPE_LABEL[b.profile_type || "student"]?.label || "Étudiant(e)";
  return (
    <BadgeRow>
      {b.verified_plus ? (
        <Badge tone="top" icon="shield-checkmark" label="Jokoo Verified+" size={size} />
      ) : null}
      {b.recommended_by_jokoo ? (
        <Badge tone="top" icon="heart" label="Recommandé par les familles" size={size} />
      ) : null}
      {b.identity_verified ? (
        <Badge tone="verified" icon="checkmark-circle" label="Identité vérifiée" size={size} />
      ) : null}
      {b.student_card_verified ? (
        <Badge tone="verified" emoji={profileEmoji} label={`${profileLbl} vérifié`} size={size} />
      ) : null}
      {langs ? (
        <Badge tone="language" icon="globe-outline" label={langs} size={size} />
      ) : null}
      {!compact ? (
        <Badge tone="assist" icon="medkit-outline" label="Assistance Jokoo 24/7" size={size} />
      ) : null}
      {b.psc1_certified && !compact ? (
        <Badge tone="top" icon="ribbon-outline" label="Premiers secours (PSC1)" size={size} />
      ) : null}
    </BadgeRow>
  );
}

/** Availability chips — même style neutre, icônes colorées. */
export function AvailabilityChips({ b }: { b: Babysitter }) {
  const items: { icon: any; label: string; tone: any }[] = [];
  if (b.available_today) items.push({ icon: "calendar-outline", label: "Disponible aujourd'hui", tone: "verified" });
  if (b.night_care) items.push({ icon: "moon-outline", label: "Garde de nuit", tone: "info" });
  if (b.can_travel) items.push({ icon: "car-outline", label: "Se déplace", tone: "info" });
  if (items.length === 0) return null;
  return (
    <BadgeRow>
      {items.map((it) => (
        <Badge key={it.label} icon={it.icon} label={it.label} tone={it.tone} size="sm" />
      ))}
    </BadgeRow>
  );
}
