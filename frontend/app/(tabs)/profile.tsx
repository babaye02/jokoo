import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, Booking } from "@/src/api";
import { Avatar, Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { ConfirmDialog } from "@/src/components/ActionSheet";

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  completed: "Terminée",
  cancelled: "Annulée",
};
const STATUS_COLOR: Record<string, string> = {
  pending: colors.warning,
  accepted: colors.turquoise,
  rejected: colors.danger,
  completed: colors.success,
  cancelled: colors.textMuted,
};

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Booking[]>("/bookings");
      setBookings(list.slice(0, 5));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const logout = async () => { await signOut(); router.replace("/login"); };

  const deleteAccount = () => {
    setDelErr(null);
    setAskDelete(true);
  };

  const doDelete = async () => {
    setDeleting(true);
    setDelErr(null);
    try {
      await api.del("/users/me");
      await signOut();
      router.replace("/login");
    } catch (e: any) {
      setDelErr(e?.message || "Impossible de supprimer le compte. Réessayez.");
    } finally {
      setDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        {/* Header */}
        <SafeAreaView edges={["top"]} style={styles.header}>
          <View style={{ alignItems: "center" }}>
            <Avatar uri={user.avatar} name={user.name} size={92} />
            <Txt size="xl" weight="700" style={{ marginTop: spacing.md }}>{user.name}</Txt>
            <Txt size="sm" color={colors.textMuted}>{user.email}</Txt>
            <View style={styles.roleBadge}>
              <Ionicons name={user.role === "prestataire" ? "briefcase" : "person"} size={12} color={colors.white} />
              <Txt size="xxs" color={colors.white} weight="700" style={{ marginLeft: 4 }}>
                {user.role === "prestataire" ? "PRESTATAIRE" : "CLIENT"}
              </Txt>
            </View>
          </View>
        </SafeAreaView>

        {/* Dashboard shortcut for prestataire */}
        {user.role === "prestataire" ? (
          <View style={{ padding: spacing.xl }}>
            <Pressable onPress={() => router.push("/dashboard")} style={styles.dashCta} testID="open-dashboard">
              <View>
                <Txt size="lg" weight="700" color={colors.white}>Tableau de bord</Txt>
                <Txt size="sm" color="rgba(255,255,255,0.8)" style={{ marginTop: 2 }}>Revenus, calendrier, demandes</Txt>
              </View>
              <Ionicons name="arrow-forward-circle" size={32} color={colors.white} />
            </Pressable>
          </View>
        ) : (
          <View style={{ height: spacing.xl }} />
        )}

        {/* Recent bookings */}
        <View style={{ paddingHorizontal: spacing.xl }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
            <Txt size="lg" weight="700">{user.role === "prestataire" ? "Demandes récentes" : "Vos réservations"}</Txt>
          </View>
          {bookings.length === 0 ? (
            <Card><Txt color={colors.textMuted}>Aucune réservation pour le moment.</Txt></Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {bookings.map((b) => (
                <Card key={b.id} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Txt weight="700">{user.role === "prestataire" ? b.client_name : b.provider_name}</Txt>
                      <Txt size="xs" color={colors.textMuted}>{b.provider_service} · {b.date} {b.time}</Txt>
                    </View>
                    <View style={[styles.pill, { backgroundColor: `${STATUS_COLOR[b.status]}22` }]}>
                      <Txt size="xxs" weight="700" color={STATUS_COLOR[b.status]}>{STATUS_LABEL[b.status]}</Txt>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* Menu */}
        <View style={{ padding: spacing.xl, gap: spacing.sm }}>
          <MenuRow icon="heart-outline" title="Favoris" onPress={() => router.push("/favorites")} testID="menu-favorites" />
          <MenuRow icon="car-sport-outline" title="Mobilité · Covoiturage" onPress={() => router.push("/mobility")} testID="menu-mobility" />
          <MenuRow icon="ticket-outline" title="Mes trajets" onPress={() => router.push("/mobility/rides/mine")} testID="menu-rides" />
          <MenuRow icon="cube-outline" title="Mes colis · Livraison" onPress={() => router.push("/mobility/delivery/mine")} testID="menu-parcels" />
          <MenuRow icon="people-outline" title="Jokoo Family · Baby-sitting" onPress={() => router.push("/family")} testID="menu-family" />
          <MenuRow icon="school-outline" title="Mes réservations Family" onPress={() => router.push("/family/mine")} testID="menu-family-mine" />
          <MenuRow icon="document-text-outline" title="Centre juridique" onPress={() => router.push("/legal")} testID="menu-legal" />
          {user.role === "prestataire" ? (
            <>
              <MenuRow icon="pricetags-outline" title="Mes prestations" onPress={() => router.push("/my-services")} testID="menu-my-services" />
              <MenuRow icon="rocket-outline" title="Sponsoriser mon profil" onPress={() => router.push("/sponsor")} testID="menu-sponsor" />
              <MenuRow icon="person-circle-outline" title="Profil prestataire" onPress={() => router.push("/provider-profile")} testID="menu-provider-profile" />
            </>
          ) : null}
          {user.is_admin || user.staff_role ? (
            <MenuRow icon="shield-outline" title="Espace administrateur" onPress={() => router.push("/admin")} testID="menu-admin" />
          ) : null}
          <MenuRow icon="card-outline" title="Paiements" onPress={() => router.push("/profile/payments")} testID="menu-payments" />
          <MenuRow icon="settings-outline" title="Paramètres" onPress={() => router.push("/profile/settings")} testID="menu-settings" />
          <MenuRow icon="shield-checkmark-outline" title="Sécurité & confidentialité" onPress={() => router.push("/profile/security")} testID="menu-security" />
          <MenuRow icon="help-circle-outline" title="Aide" onPress={() => router.push("/profile/help")} testID="menu-help" />
          <Pressable onPress={logout} style={[styles.row, { marginTop: spacing.md }]} testID="menu-logout">
            <View style={[styles.iconWrap, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            </View>
            <Txt weight="600" color={colors.danger} style={{ flex: 1, marginLeft: 12 }}>Se déconnecter</Txt>
          </Pressable>
          <Pressable onPress={deleteAccount} style={styles.row} testID="menu-delete-account">
            <View style={[styles.iconWrap, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </View>
            <Txt weight="600" color={colors.danger} style={{ flex: 1, marginLeft: 12 }}>Supprimer mon compte</Txt>
          </Pressable>
          {delErr ? (
            <View style={styles.errBanner} testID="delete-error">
              <Ionicons name="warning" size={16} color={colors.white} />
              <Txt color={colors.white} weight="600" style={{ flex: 1, marginLeft: 8 }} size="sm">
                {delErr}
              </Txt>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={askDelete}
        onClose={() => !deleting && setAskDelete(false)}
        title="Supprimer mon compte ?"
        message="Cette action est irréversible. Vos données personnelles seront supprimées immédiatement et vos réservations historiques anonymisées."
        confirmLabel={deleting ? "Suppression…" : "Oui, supprimer"}
        cancelLabel="Annuler"
        destructive
        onConfirm={doDelete}
      />
    </View>
  );
}

function MenuRow({ icon, title, onPress, testID }: { icon: any; title: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.midnight} />
      </View>
      <Txt weight="600" style={{ flex: 1, marginLeft: 12 }}>{title}</Txt>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingTop: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, ...shadow.soft },
  roleBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.midnight, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill, marginTop: spacing.sm,
  },
  dashCta: {
    backgroundColor: colors.midnight, borderRadius: radius.lg, padding: spacing.lg,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    ...shadow.card,
  },
  row: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    flexDirection: "row", alignItems: "center", ...shadow.soft,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  errBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: spacing.sm,
  },
});
